import SwiftUI

struct CandidateStripMessage<Message: View>: View {
  @ViewBuilder let message: Message

  var body: some View {
    HStack {
      message
      Spacer()
    }
    .font(.body)
    .foregroundStyle(.secondary)
    .fixedSize(horizontal: false, vertical: true)
    .padding(.horizontal, 14)
    .padding(.vertical, 6)
    .frame(minHeight: 46)
  }
}
