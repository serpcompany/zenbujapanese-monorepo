import CryptoKit
import Darwin
import SQLite3
import UIKit

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let label = UILabel(frame: window.bounds.insetBy(dx: 20, dy: 60))
        label.numberOfLines = 0
        label.text = "Issue #147 comparable workload running"
        let controller = UIViewController()
        controller.view.backgroundColor = .systemBackground
        controller.view.addSubview(label)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try Probe.run()
                let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
                let output = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("result.json")
                try data.write(to: output, options: .atomic)
                DispatchQueue.main.async { label.text = String(data: data, encoding: .utf8) }
            } catch {
                DispatchQueue.main.async { label.text = "FAIL: \(error)" }
            }
        }
        return true
    }
}

final class RSSSampler: @unchecked Sendable {
    private let lock = NSLock()
    private let group = DispatchGroup()
    private var running = false
    private var maximum: UInt64 = 0

    func start() {
        lock.lock(); running = true; maximum = Probe.residentBytes(); lock.unlock()
        group.enter()
        DispatchQueue.global(qos: .utility).async { [self] in
            defer { group.leave() }
            while true {
                lock.lock()
                let shouldRun = running
                maximum = max(maximum, Probe.residentBytes())
                lock.unlock()
                if !shouldRun { return }
                usleep(10_000)
            }
        }
    }

    func stop() -> UInt64 {
        lock.lock(); running = false; lock.unlock()
        group.wait()
        lock.lock(); defer { lock.unlock() }
        return maximum
    }
}

enum Probe {
    static let queries = ["scared you", "scare you", "red you", "scatter", "education", "cat!"]
    static let iterations = 100

    static func run() throws -> [String: Any] {
        #if FTS_PROBE
        return try runComparableWorkload(engine: "sqlite-fts4-porter")
        #else
        return try runComparableWorkload(engine: "zenbu-literal-substring-baseline")
        #endif
    }

    static func runComparableWorkload(engine: String) throws -> [String: Any] {
        let fm = FileManager.default
        let source = Bundle.main.url(forResource: "LanguageReferenceData", withExtension: "sqlite3")!
        let destination = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Issue147Workload.sqlite3")
        let sampler = RSSSampler()
        sampler.start()

        let prepareStart = ContinuousClock.now
        try? fm.removeItem(at: destination)
        try fm.copyItem(at: source, to: destination)
        let db = try open(destination.path)
        if engine == "sqlite-fts4-porter" {
            try exec(db, "CREATE VIRTUAL TABLE issue147_english_fts USING fts4(id, english, tokenize=porter)")
            try exec(db, "INSERT INTO issue147_english_fts SELECT id, english FROM example_sentences")
            try exec(db, "VACUUM")
        }
        let prepareMS = milliseconds(prepareStart.duration(to: .now))

        let warmup = try batchDigest(db, engine: engine)
        var timings: [Double] = []
        var sequentialHashesEqual = true
        for _ in 0..<iterations {
            let start = ContinuousClock.now
            let iterationHash = try batchDigest(db, engine: engine).hash
            sequentialHashesEqual = sequentialHashesEqual && iterationHash == warmup.hash
            timings.append(milliseconds(start.duration(to: .now)))
        }

        let expectedHash = warmup.hash
        let concurrentLock = NSLock()
        var concurrentHashes: [String] = []
        let concurrentGroup = DispatchGroup()
        for _ in 0..<8 {
            concurrentGroup.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                defer { concurrentGroup.leave() }
                let workerDB = try? open(destination.path, flags: SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX)
                let hash = workerDB.flatMap { handle -> String? in
                    defer { sqlite3_close(handle) }
                    return try? batchDigest(handle, engine: engine).hash
                } ?? "ERROR"
                concurrentLock.lock(); concurrentHashes.append(hash); concurrentLock.unlock()
            }
        }
        concurrentGroup.wait()

        var steadySamples: [UInt64] = []
        for _ in 0..<9 { steadySamples.append(residentBytes()); usleep(20_000) }
        steadySamples.sort()
        let steadyRSS = steadySamples[4]
        sqlite3_close(db)
        let peakRSS = sampler.stop()
        timings.sort()
        let attrs = try fm.attributesOfItem(atPath: destination.path)
        let deterministic = sequentialHashesEqual && concurrentHashes.allSatisfy { $0 == expectedHash }

        return [
            "engine": engine,
            "status": deterministic ? "pass" : "fail",
            "cold_prepare_ms": prepareMS,
            "warm_six_query_iterations": iterations,
            "warm_six_query_p50_ms": timings[49],
            "warm_six_query_p95_ms": timings[94],
            "steady_query_rss_bytes": steadyRSS,
            "steady_rss_definition": "median of 9 samples at 20ms intervals after sequential and concurrent query workloads while the corpus database remains open",
            "peak_sampled_rss_bytes": peakRSS,
            "peak_rss_definition": "maximum 10ms sample from before corpus copy/open through steady-query sampling; sampling may miss sub-10ms transients",
            "rss_sample_interval_ms": 10,
            "database_bytes": attrs[.size] as? NSNumber ?? 0,
            "source_database_bytes": (try fm.attributesOfItem(atPath: source.path)[.size]) as? NSNumber ?? 0,
            "eligible_rows_per_batch": warmup.count,
            "deterministic_hash": expectedHash,
            "sequential_hashes_equal": sequentialHashesEqual,
            "concurrent_workers": 8,
            "concurrent_hashes_equal": concurrentHashes.allSatisfy { $0 == expectedHash }
        ]
    }

    static func batchDigest(_ db: OpaquePointer, engine: String) throws -> (hash: String, count: Int) {
        var hasher = SHA256()
        var count = 0
        for query in queries {
            hasher.update(data: Data(query.utf8)); hasher.update(data: Data([0]))
            let sql = engine == "sqlite-fts4-porter"
                ? "SELECT id FROM issue147_english_fts WHERE issue147_english_fts MATCH ? ORDER BY rowid"
                : "SELECT id FROM example_sentences WHERE instr(lower(english), lower(?)) > 0 ORDER BY length(japanese), id"
            let argument = engine == "sqlite-fts4-porter" ? "\"\(query.replacingOccurrences(of: "\"", with: "\"\""))\"" : query
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw failure(db) }
            defer { sqlite3_finalize(statement) }
            sqlite3_bind_text(statement, 1, argument, -1, SQLITE_TRANSIENT)
            while sqlite3_step(statement) == SQLITE_ROW {
                hasher.update(data: Data(String(cString: sqlite3_column_text(statement, 0)).utf8))
                hasher.update(data: Data([10])); count += 1
            }
        }
        return (hasher.finalize().map { String(format: "%02x", $0) }.joined(), count)
    }

    static func open(_ path: String, flags: Int32 = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX) throws -> OpaquePointer {
        var db: OpaquePointer?
        guard sqlite3_open_v2(path, &db, flags, nil) == SQLITE_OK, let db else { throw failure(db) }
        return db
    }

    static func exec(_ db: OpaquePointer, _ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw failure(db) }
    }

    static func failure(_ db: OpaquePointer?) -> NSError {
        NSError(domain: "Issue147Probe", code: 1, userInfo: [NSLocalizedDescriptionKey: db.map { String(cString: sqlite3_errmsg($0)) } ?? "sqlite open failure"])
    }

    static func milliseconds(_ duration: Duration) -> Double {
        let value = duration.components
        return Double(value.seconds) * 1000 + Double(value.attoseconds) / 1e15
    }

    static func residentBytes() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? UInt64(info.resident_size) : 0
    }
}
