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
  longrun: {
    look: "Each green column is the longest run of that week. Weeks with no run have no column.",
    picture: "It is the longest leg of the road trip each week. Marathon training usually stretches this leg a little at a time, with easier weeks in between.",
    example: "Sam's long runs go 14, 16, 18 and then 26 kilometres. That last column is a big jump after a steady climb, so it is the one to look at twice. The plan has its own limits on jumps like this.",
  },
  vo2: {
    look: "The line is your VO2max, which is COROS's estimate of how much oxygen your body can use. It is a measure of aerobic fitness.",
    picture: "It is the size of the engine. It grows slowly, over weeks and months, so look at the direction and not at one reading.",
    example: "Sam's line goes 48, then 49, then 50 over a couple of months. A slightly bigger engine, slowly. COROS only tells us today's number, so this chart starts when the app began saving it and fills in as days pass.",
  },
  threshold: {
    look: "The line is your threshold pace, which is roughly the fastest pace you could hold for a long, hard effort. Faster paces are higher up, so a rising line means improving.",
    picture: "It is the speed you can hold without the engine overheating.",
    example: "Sam's line drifts from 4:10 a kilometre to 4:00 over a few months. Sam can now hold a quicker pace before the engine starts to overheat. Like VO2max, this only moves slowly.",
  },
  marathon: {
    look: "The purple line is COROS's predicted marathon time. The dashed grey lines are your three goals. Faster times are higher up.",
    picture: "It is the arrival time on the car's satnav. The satnav guesses from your recent runs and your fitness, and it does not know about the weather, the hills or whether you will run out of fuel.",
    example: "Sam's goal A is 3:15 and the satnav says 3:06. The tooltip shows that as a gap, 9 minutes faster than the goal. Watch predictions can be optimistic, so Sam treats it as a rough guide and not a promise.",
  },
  efficiency: {
    look: "Each dot is one easy run. Going across is the average heart rate. Going up is the pace, with faster runs higher up. Colour and shape show the month, and grey rings are older runs.",
    picture: "It is the same amount of fuel taking you further. If newer dots sit higher or further left than older ones, you are going faster for the same effort, or the same speed with a calmer heart.",
    example: "Sam's September runs sit at about 155 beats and 6:10 a kilometre. October's sit at about 150 beats and 6:00. That is faster at a lower heart rate, which is what a more efficient engine looks like. Hills, heat, tiredness and a bad night all push a dot around, so only compare similar runs. Wrist heart rate can be off, and the chest strap will make this clearer.",
  },
  stress: {
    look: "The yellow line is your average stress each day, as COROS scores it. The dashed grey line is your own usual over the last 28 days.",
    picture: "It is the engine's temperature gauge. A reading a little above your usual after a hard week is normal. A gauge that stays high while your sleep and recovery slip is the pattern to notice.",
    example: "Sam's gauge sits around 34. After a trip and two short nights it reads 56 for three days, well above the dashed line. One day is a bump. Three days together, with poor sleep, is worth noticing.",
  },
  recovery: {
    look: "The blue line is the last recovery reading of each day. The shaded band shows that day's lowest and highest readings. Below it, a small chart shows today's readings so far.",
    picture: "It is the fuel gauge, read every three hours. After a hard session the needle drops, and it climbs back as you rest.",
    example: "Sam finishes a long run and the gauge falls to 45% by the evening. The next morning it reads 85%. If it is still low two mornings later, Sam has not finished refuelling. COROS only tells us the current reading, so this chart began on 9 Nov and fills in as the days pass.",
  },
  loadday: {
    look: "Each column is one day, or one week, of training load. Aqua is running and violet is gym. The numbers are COROS's own training load for each workout, added up. A day with no workout has no column.",
    picture: "It is how hard each day of the road trip was. A tall column is a steep hill, and several tall columns in a row is a mountain pass.",
    example: "Sam's runs score about 60 to 90 and a gym day about 30. The long run of 240 stands tall. The easy week after it shows small columns. Runs from before September may have no load figure, so those days are left empty and not counted as zero.",
  },
  loadhrv: {
    look: "Each dot is one day. Going across is that day's training load. Going up is how your HRV the next morning compared with COROS's baseline for that date. A dot above the dashed line means a better morning than usual, and below means a lower one. Rest days sit on the left edge.",
    picture: "It is asking whether a bigger day on the road leaves the suspension stiffer the next morning. With only a handful of days, it is a hint and not an answer.",
    example: "Sam's rest days land close to the dashed line. After a load of 240 the next morning sits 9 below it. One dot proves nothing, because sleep, stress and a glass of wine all move HRV too. If the big days keep landing low over many weeks, Sam has learned how much a hard day costs.",
  },
  effort: {
    look: "Each dot is one workout. Going across is how it felt, from Very Easy to Very Hard, as you rated it on the watch. Going up is your HRV from the morning of that workout. Dots can sit on top of each other, and the tooltip names each one.",
    picture: "It is asking whether the fuel stop before a trip tells you how the trip will feel. Maybe a smooth night means an easy drive, and maybe not.",
    example: "Sam's three Hard runs came after nights of 48, 52 and 50. The Easy runs came after 60 and above. With so few dots that could be chance, so Sam keeps logging and looks again in a few weeks. Workouts with no rating, or a word outside the five, are left out and counted underneath.",
  },
} satisfies Record<string, HowTo>;
