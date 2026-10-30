/**
 * The motivational line on the member app home card: one per day, the same for every member, and
 * a different one each day for 100 days before the list starts again.
 *
 * The day is the Asia/Kolkata calendar date (callers pass `todayIST()`), so a quote changes at
 * India midnight rather than at the server's UTC midnight. The pick is a pure function of the date,
 * with no storage: nothing to keep in sync, and a refresh never changes the quote.
 *
 * The lines are written for this app and carry no attribution on purpose: they are not quotations
 * from named people, so none can be misattributed.
 */
export const DAILY_QUOTES: readonly string[] = [
  // Showing up
  'Showing up on a tired day is the workout that counts the most.',
  'You do not need a perfect day. You need to start the day you have.',
  'The hardest rep is the one you do before you leave home.',
  'Some days the win is simply walking through the door.',
  'Come as you are today. The gym will meet you there.',
  'Ten honest minutes beat an hour you keep postponing.',
  'Today is a good day to keep a promise to yourself.',
  'Start slow, start small, but start.',
  'The door is open. The only thing left to do is walk in.',
  'A short workout is still a workout. A skipped one is just a skipped one.',

  // Consistency
  'Strong is built one ordinary day at a time.',
  'Consistency is quiet. It never looks exciting until you look back.',
  'Do not count the days. Make the days count.',
  'Small efforts repeated beat big efforts forgotten.',
  'Your streak is made of mornings you did not feel like it.',
  'Progress is the sum of the days nobody clapped for.',
  'Repeat the basics until they become who you are.',
  'The plan you follow beats the plan you perfect.',
  'One more day is how every long journey is done.',
  'Habits are built in the boring middle, not the exciting start.',

  // Effort and discipline
  'Discipline is choosing what you want most over what you want now.',
  'Motivation gets you started. Habit keeps you going.',
  'Sweat is the body saying thank you for the challenge.',
  'Comfort is a nice place to visit and a poor place to grow.',
  'Earn your rest. Then enjoy it.',
  'Effort you can see today is strength you will feel tomorrow.',
  'Do the work now so future you can say thanks.',
  'Hard work has a way of making everything else feel lighter.',
  'The weight does not care about your excuses. It also does not judge them.',
  'Push a little further than yesterday. That is all.',

  // Patience and progress
  'Slow progress is still progress.',
  'Your body hears everything your mind says. Speak kindly.',
  'Results take time because change is real.',
  'Do not compare your first chapter to someone else\'s tenth.',
  'Be patient. Muscles grow in rest and in time.',
  'Every expert was once a beginner who kept coming back.',
  'You are not behind. You are on your own path.',
  'Growth is rarely loud. It is steady.',
  'A plateau is just the body getting ready for the next step.',
  'Trust the process, then trust it again tomorrow.',

  // Mindset
  'The mind quits before the body does. Keep going a little longer.',
  'Believe you can, then prove it one set at a time.',
  'Fear is just excitement without a plan. Make the plan.',
  'Your only competition is who you were yesterday.',
  'Strong thoughts build strong habits.',
  'Doubt is loud. Action is louder.',
  'You are stronger than the voice that says stop.',
  'Courage is lifting it when you are not sure you can.',
  'A positive mind makes every workout lighter.',

  // Health
  'Take care of your body. It is the only place you have to live.',
  'Health is the quiet wealth you build every day.',
  'Move today so your future self can move freely.',
  'Fitness is not a season. It is a way to look after yourself.',
  'Good food, good sleep, good movement. Repeat.',
  'Look after your body and it will carry you through everything else.',
  'The best time to start caring for your health was yesterday. The next best is now.',
  'Energy is built, not found. Build some today.',
  'Rest is part of training, not the opposite of it.',
  'A healthy habit today is a gift for every year ahead.',

  // Strength of character
  'Strength is not only in the muscles. It is in showing up again.',
  'Fall seven times, train eight.',
  'The comeback is always stronger than the setback.',
  'Do what is hard today and life gets easier later.',
  'You have survived every hard day so far. Today will be no different.',
  'Resilience is built under the bar and in the rest of life.',
  'Pain is temporary. Giving up lasts much longer.',
  'Be proud of the effort, not just the outcome.',
  'Hard times build strong people. Strong people build strong days.',
  'You grow most when it is not easy.',

  // Goals
  'Set a goal that scares you a little, then train toward it.',
  'A goal without a daily action is just a wish.',
  'Break the big goal into small wins and collect them.',
  'Write the goal down. Then write the first step beside it.',
  'The finish line is made of thousands of small starts.',
  'Aim for better, not perfect.',
  'Know why you started. Let it pull you through the hard days.',
  'Celebrate the small wins. They are the real milestones.',
  'The next level is on the other side of your comfort zone.',
  'Keep your eyes on the goal and your hands on the work.',

  // Life
  'Life rewards those who keep moving.',
  'Be the person you needed when you were starting out.',
  'Every day is a fresh page. Write something you are proud of.',
  'Do something today that your future self will thank you for.',
  'Small steps in the right direction are never wasted.',
  'You do not have to be extreme, just consistent.',
  'Gratitude for a strong body makes training feel like a privilege.',
  'Make time for yourself. Nobody else can do it for you.',
  'The best project you will ever work on is you.',

  // Community and energy
  'Surround yourself with people who make you want to show up.',
  'Strength grows faster when you train alongside others.',
  'Cheer for the person next to you. Their win is a good day for everyone.',
  'A gym is better when everyone in it is rooting for each other.',
  'Bring your energy. It spreads further than you think.',
  'Every member here started with a first day, just like you.',
  'Train hard, stay kind.',
  'When it is heavy, remember how many people are cheering for you.',

  // Close of day
  'Finish what you started this week. Then start again.',
  'Today you chose strength. That is a good choice to make every day.',
  'Another day, another chance to be a little better.',
  'End the day knowing you did your part.',
]
// 100 entries; the unit test checks the count and that none repeats.

/** Whole days since 1970-01-01 for a 'YYYY-MM-DD' calendar date (no time zone: it is a date). */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** The quote for one calendar date: the same all day, the next one tomorrow. */
export function quoteForDate(date: string): string {
  const n = DAILY_QUOTES.length
  const index = ((dayNumber(date) % n) + n) % n
  return DAILY_QUOTES[index]
}
