# Progress and the daily goal

Account's progress section, under the profile and above every other row
([Account](index.md#account)), holds the **Today** card and the **Daily Goal** row. It shows the
shared core's progress stats, from the progress log ([Saved data](saved-data.md)), and counts
nothing itself.

## The Today card

A ring of the words marked Learning today against the daily goal, "12 of 20 new words", with
"8 more to reach today's goal" under it or **Goal met**; the last seven days as weekday letters,
each marked met, short, or today (days before the log began show as short); and the streak, such
as "6-day streak". With nothing marked Learning yet it shows "0 of 20 new words" and no streak.
VoiceOver reads the card as one element: "Today, 12 of 20 new words, 6-day streak", with "goal met"
before the streak once it is. At the largest text sizes the ring sits above the words and the days
wrap onto two rows.

## The daily goal

**Daily Goal** shows the goal, "20 new words", and opens a sheet with the presets 5 · Light,
10 · Steady, 20 · Focused (the goal until one is chosen), and 30 · Intense, each with about 30 times
as many a month, and **Custom**, a stepper from 1 to 200. Under them, "At 20 a day" gives the new
words a month. **Done** keeps the choice and **Cancel** drops it. The goal is kept under
`progress.dailyGoal` and syncs ([Zenbu account and sync](account-sync.md)).

Check: UI `AccountUITests.testTheTodayCardCountsWordsMarkedLearningAgainstTheGoalTheSheetChooses`
(the count and goal, a word marked Learning raising it, and a preset changing the card and the row)
and `testTheTodayCardShowsAStreakAndAMetGoal` (a streak seeded with `ZENBU_PROGRESS_STREAK`, the goal
met, and Custom); `AccountAuditUITests` (the section alone at the largest size, and the sheet);
package `SyncedSettingsTests` and `SharedSettingsRulesTests` (the goal's values).
