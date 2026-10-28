# Progress and the daily goal

Account's progress section, under the profile and above every other row
([Account](index.md#account)), holds the **Today** card, the **Progress** row, and the **Daily Goal**
row. The card and the Progress screen show the shared core's progress stats, from the progress log
([Saved data](saved-data.md)), and count nothing themselves.

## The Today card

A ring of the words marked Learning today against the daily goal, "12 of 20 new words", with
"8 more to reach today's goal" under it or **Goal met**; the last seven days as weekday letters,
each marked met, short, or today (days before the log began show as short); and the streak, such
as "6-day streak", with **See progress** beside it. With nothing marked Learning yet it shows "0 of 20 new words" and no streak.
VoiceOver reads the card as one element: "Today, 12 of 20 new words, 6-day streak", with "goal met"
before the streak once it is. At the largest text sizes the ring sits above the words, the days
stay on one row inside the card, and **See progress** goes under the streak. When the date changes
while Zenbu is open, and when Zenbu becomes active again on a different date than it last read, the
card moves to the new day; becoming active on the same date changes nothing.

## The Progress screen

**See progress** on the Today card and the **Progress** row open **Progress** on Account's stack.
From the top:

- **Today**: the card's ring, larger, with the count inside and "of 20 today" under it (under the
  ring at the largest text sizes), then "8 more to go" or **Goal met**, and the streak once there is
  one. VoiceOver reads it as one element, in the Today card's words with what's left added: "Today,
  12 of 20 new words, 8 more to go, 6-day streak", or "goal met" in its place.
- Four tiles, two by two, or one column at the largest text sizes: **Known**, with "+16 in 7 days"
  marked Known; **Learning**, with "+76 in 7 days" marked Learning; **Best streak**, its length and
  dates, "9 days" and "Oct 1 – Oct 9"; and **Daily average**, the words a day over the last 7 days
  before today, "11.4" and "last 7 days". With no streak or no day yet, a tile shows "—" with "No
  streak yet" or "No days yet".
- **New words per day**: a bar a day, with a dashed line that steps to each day's own goal, so a
  bar over the line is a day that met its goal even after the goal changed, labelled with today's
  goal, for the **Week** (the default, not remembered), over weekday letters, or the **Month**, over
  its first day and "Today"; days before the log began are empty, at the first day's goal. Above the chart is today's
  line, "Tue, Oct 27 · 4 words · goal 10", and tapping a bar shows that day's instead,
  "Mon, Oct 26 · 15 words · goal met". Under it, "Goal met 6 of 6 days · 76 words", where today
  counts only once its goal is met, or "0 words so far" before any. VoiceOver reads each bar, in the
  Week and in the Month, as its day's line, and the goal as one element, "Goal, 10 new words",
  today's.
- **JLPT coverage**: a bar for each level from N5 to N1, its Known and Learning words in two bands,
  with "45% known · 298 / 667", from the same JLPT coverage as the Daily Goal sheet's pace.
- **Known over time**: the Known words on each day of the log, with "+16 in 7 days" and the first
  day's and today's counts; with fewer than two days, "Your Known words show here as the days go by."

Check: UI `ProgressUITests` (in from the card and from the row, the totals and streaks of a log
seeded from `Fixtures/Progress/dashboard.json` with `ZENBU_PROGRESS_SEED`, Week and Month, Week again
after leaving, tapping a bar, a Month bar read as its day's line, and the screen before any word); `AccountUITests.testAccountListsEveryArea`
(**See progress** and the row); `AccountAuditUITests` (Progress, its Week and Month, and its end, at
the default and largest sizes and in dark); package `ProgressWordingTests` (Progress's words) and
`ProgressLogTests.statsThroughTheBundle`; core `progress/stats.test.ts` (the last 7 and 30 days,
the days before the log at the first day's goal, the days that met the goal, and the totals).

## The daily goal

**Daily Goal** shows the goal, "20 new words", and opens a sheet with the presets 5 · Light,
10 · Steady, 20 · Focused (the goal until one is chosen), and 30 · Intense, each with about 30 times
as many a month, and **Custom**, a stepper from 1 to 200. Under them, "At 20 a day" gives the new
words a month and, from the shared core's JLPT coverage at that goal, the day every N5, N4, and N3
word would be in Learning ("All N5 in Learning", Done once it is). **Done** keeps the choice and
**Cancel** drops it. The goal is kept under
`progress.dailyGoal` and syncs ([Zenbu account and sync](account-sync.md)).

Check: UI `AccountUITests.testTheTodayCardCountsWordsMarkedLearningAgainstTheGoalTheSheetChooses`
(the count and goal, a word marked Learning raising it, and a preset changing the card and the row)
and `testTheTodayCardShowsAStreakAndAMetGoal` (a streak seeded with `ZENBU_PROGRESS_STREAK`, the goal
met, and Custom); `AccountAuditUITests` (the section alone at the largest size, and the sheet);
package `SyncedSettingsTests` and `SharedSettingsRulesTests` (the goal's values), and
`ProgressWordingTests` (the pace's dates and the card's words), `ProgressLogTests.dayTurns`, `resumeOnANewDay`, and `resumeOnTheSameDay` (the
card's new day), `SyncedSettingsTests.roundedGoalStaysUnsent` (a rounded goal isn't sent back), and
`TodayProgressCardLayoutTests` (the card fits a 320-point row at large, AX3, and AX5).
