export function normalizePrediction(prediction){

  const p =
    prediction?.predictions ||
    {};

  const winner =
    p?.winner ||
    {};

  const percent =
    p?.percent ||
    {};

  const advice =
    p?.advice ||
    "";

  const underOverRaw =
    p?.under_over ||
    "";

  let pick = "X";

  // DETECT PICK
  if (
    winner?.comment &&
    /away/i.test(
      winner.comment
    )
  ){

    pick = "2";

  }

  else if (
    winner?.comment &&
    /draw/i.test(
      winner.comment
    )
  ){

    pick = "X";

  }

  else {

    pick = "1";
  }

  // LAST 5 GOALS
  const homeRecentGoals =
    Number(
      prediction?.teams?.home?.last_5?.goals?.for?.total || 10
    );

  const awayRecentGoals =
    Number(
      prediction?.teams?.away?.last_5?.goals?.for?.total || 8
    );

  // BUILD NATURAL SCORE
  let homeGoals = 1;
  let awayGoals = 1;

  if (pick === "1"){

    homeGoals =
      Math.max(
        1,
        Math.round(
          homeRecentGoals / 5
        )
      );

    awayGoals =
      Math.max(
        0,
        Math.round(
          awayRecentGoals / 10
        )
      );
  }

  else if (pick === "2"){

    awayGoals =
      Math.max(
        1,
        Math.round(
          awayRecentGoals / 5
        )
      );

    homeGoals =
      Math.max(
        0,
        Math.round(
          homeRecentGoals / 10
        )
      );
  }

  else {

    homeGoals = 1;
    awayGoals = 1;
  }

  // LIMIT MAX
  if (homeGoals > 4){
    homeGoals = 4;
  }

  if (awayGoals > 4){
    awayGoals = 4;
  }

  // BUILD O/U
  let underOver =
    "UNDER 2.5";

  const cleanOU =
    String(
      underOverRaw || ""
    )
      .replace("-", "")
      .trim();

  if (cleanOU){

    underOver =
      `OVER ${cleanOU}`;
  }

  else {

    underOver =
      homeGoals + awayGoals >= 3
        ? "OVER 2.5"
        : "UNDER 2.5";
  }

  return {

    pick,

    advice,

    underOver,

    score:
      `${homeGoals} - ${awayGoals}`,

    percentHome:
      percent?.home || "",

    percentDraw:
      percent?.draw || "",

    percentAway:
      percent?.away || ""

  };
}
