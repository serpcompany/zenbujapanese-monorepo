# Daily Lists

Each day's new Learning words go in a list of their own, a **daily list**, which Zenbu makes and
keeps; the learner doesn't. They sit beside the learner's own lists ([Lists](index.md#lists)).

## What goes in a day's list

A word joins the day's list when it is marked Learning from Unknown on this device that day, by the
device's own calendar, and the list is made, named by its date ("Oct 28, 2026"), with that first
word. It is the same rule the [Today card](progress.md#the-today-card) counts by, from the shared
core's progress stats:

- A word set back to Unknown the same day leaves the list; one marked Known stays in it.
- A word moved from Known back to Learning, and a kanji, isn't added.
- A change made after midnight goes in the next day's list, and a later change leaves an earlier
  day's list alone.
- A change synced from another device or app touches no daily list: each device puts only its own
  marks in, and the lists themselves sync ([Zenbu account and sync](account-sync.md)): a day's
  list made on two devices is one list, with both devices' words.
- A word removed from a daily list by hand isn't put back by a later change, and a daily list
  deleted in another Zenbu app isn't made again.

A daily list holds Learning words only as they were marked: one marked Known since stays, counted as
"now Known".

Check: package `DailyListsTests` (each rule above, a relaunch remembering a deleted day's list, and
a read-only progress log changing no list),
`SharedAccountRulesTests.dailyListIDs()` (each day's list ID and the day an ID stands for, from the
cases the account service and the website share), and `AccountSyncDailyListsTests` (a day's list
syncs past the account's 500-list cap, one another device made first counts as made, and one deleted
elsewhere or refused by the account isn't made again); UI
`DailyListsUITests.testTheDaysNewLearningWordsGoInTodaysListWhichCantBeRenamedOrDeleted`.

## Where they show

Lists shows a **Daily Lists** row above the learner's own lists, with how many there are, once there
is one. Account's Lists count, a word page's lists, and Add to List show the learner's own lists
only, and dragging Lists into order moves only those.

**Daily Lists** groups them newest first: **This week**, today and the six days before it (and any
list dated later, from a device whose clock is ahead), then a section per month, such as "October
2026". Each row is titled Today, Yesterday, or the weekday and date ("Monday, Oct 26"), with a line
such as "26 words · goal met · 8 now Known" ("12 words so far" for today) and a bar of how many are
now Known. At the largest text sizes the bar moves under the words. With none, it says "No Daily
Lists".

A daily list opens as any list does, titled the same way, and its words can be searched, removed,
and opened. Its **•••** menu only selects words: a daily list can't be renamed or deleted here.

Check: UI `DailyListsUITests.testDailyListsAreGroupedUnderThisWeekAndThenByMonthNewestFirst` (with
`ZENBU_DAILY_LISTS=12`, a Debug harness that seeds that many past days' lists) and
`AccountAuditUITests` (Lists with daily lists, Daily Lists, and a daily list); package
`DailyListsTests.titlesAndGroups()`, `rowLine()`, and `movesOwnListsOnly()`.
