// A short, fun "how to read this chart" for each chart, in the same car on a road trip picture as the guide at the top.
// Plain words, general explanations of what the numbers are (not advice, not medical advice). Sam is a made-up runner.
// Sources will be linked once the evidence library is filled (task 10 of the plan).

export type HowTo = { look: string; picture: string; example: string };

export const HOW_TO = {
  sleep: {
    look: "Each column is one night. The taller it is, the longer you were in bed. The colours show how the night split: deep (blue), REM (orange), light (green) and awake (yellow).",
    picture: "Think of the overnight fuel stop. A long stop with lots of blue and orange is a full tank. A short stop with a lot of yellow is a rushed one.",
    example: "Sam's Monday column is short and has a big yellow cap, so the fuel stop was short and broken. Tuesday and Wednesday are tall and mostly blue and orange. One short night is a bump. Several short nights in a row is worth noticing.",
  },
  score: {
    look: "The purple line is the COROS sleep score for each night. The dashed grey line is your own usual over the last 28 days. A ring means that night was unusually low for you.",
    picture: "It is the report card for the fuel stop, marked against your own usual and not against anyone else's.",
    example: "Sam usually scores about 80. A night of 55 gets a ring. One ring after a late night is nothing to worry about. A row of rings across a week is a pattern, so Sam checks the other charts too.",
  },
  hrv: {
    look: "The line is last night's HRV. The grey line is the average of the last 7 nights. The shaded band is the range COROS calls normal for you on that date.",
    picture: "HRV is how smooth the suspension is. Inside the band is a smooth ride. Under the band for several nights means a stiffer ride.",
    example: "Sam sits at about 60 inside a band of 54 to 68. One night at 44 pokes out under the band, which can happen after a hard day or a bad night. If the grey average slides under the band and stays there for several days, that is the signal worth acting on.",
  },
  rhr: {
    look: "The pink line is your resting heart rate each day. The dashed grey line is your own usual over the last 28 days.",
    picture: "It is the engine idling at the lights. If it idles faster than usual, the engine is working harder than normal.",
    example: "Sam idles at about 54. One morning at 62 sits well above the dashed line. After a hard run or a bad night that is common. Several mornings in a row above the line, with poor sleep, is a pattern.",
  },
  volume: {
    look: "Each green column is one week (Monday to Sunday) of running. The grey line is the average of the last 4 weeks. A lighter column is a week that is not finished yet.",
    picture: "It is how far you drove each week of the road trip. A column that jumps far above the grey line is a steep hill straight after flat road.",
    example: "Sam ran 40, 42 and 41 kilometres, then 58. That fourth column towers over the grey line. The plan has its own limits on jumps like this, and the chart lets Sam see it coming.",
  },
  load: {
    look: "The blue line is your short-term load, which is the last week or so. The orange line is your long-term load, which is your usual. COROS's own words, such as Optimized, show in the tooltip.",
    picture: "It is a backpack. Orange is the weight you are used to carrying. Blue is what you are carrying this week.",
    example: "Sam's blue line climbs above the orange line for two weeks, so the pack is heavier than usual. When blue drops back under orange, the pack is lighter, which is normal in a rest or easy week. How far apart the lines get matters more than which one is on top.",
  },
} satisfies Record<string, HowTo>;
