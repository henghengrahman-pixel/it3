import axios from "axios";

const DEFAULT_BASE_URL =
  "https://v3.football.api-sports.io";

function apiKey(){

  return (

    process.env.FOOTBALL_API_KEY ||

    process.env.API_FOOTBALL_KEY ||

    ""

  );
}

function apiHost(){

  return (

    process.env.FOOTBALL_API_HOST ||

    "api-football-v1.p.rapidapi.com"

  );
}

function apiBaseUrl(){

  return (

    process.env.FOOTBALL_API_BASE_URL ||

    process.env.API_FOOTBALL_BASE_URL ||

    DEFAULT_BASE_URL

  );
}

function headers(){

  const key =
    apiKey();

  const base =
    apiBaseUrl();

  if (!key){

    return {};

  }

  // RAPID API
  if (

    /rapidapi/i.test(base) ||

    process.env.FOOTBALL_API_PROVIDER ===
    "rapidapi"

  ){

    return {

      "X-RapidAPI-Key":
        key,

      "X-RapidAPI-Host":
        apiHost()

    };
  }

  // API SPORTS DIRECT
  return {

    "x-apisports-key":
      key

  };
}

async function apiGet(endpoint, params = {}){

  const url =
    `${apiBaseUrl().replace(/\/+$/, "")}${endpoint}`;

  const res =
    await axios.get(url, {

      headers:
        headers(),

      params,

      timeout:
        Number(
          process.env.FOOTBALL_API_TIMEOUT ||
          15000
        )

    });

  return res.data;
}

export function hasFootballApiKey(){

  return Boolean(
    apiKey()
  );
}

export async function getFixturesByDate(date){

  if (!hasFootballApiKey()){

    return {

      ok:false,

      error:
        "FOOTBALL_API_KEY/API_FOOTBALL_KEY belum diisi di Railway Variables.",

      fixtures:[]

    };
  }

  try {

    const data =
      await apiGet(

        "/fixtures",

        {
          date
        }

      );

    return {

      ok:true,

      error:null,

      fixtures:
        Array.isArray(
          data?.response
        )
          ? data.response
          : []

    };

  } catch (err){

    return {

      ok:false,

      error:

        err?.response?.data?.message ||

        err?.response?.data ||

        err.message ||

        "Failed fetch fixtures",

      fixtures:[]

    };
  }
}

export async function getPredictionByFixture(fixtureId){

  if (!fixtureId){

    return {

      ok:false,

      error:"Fixture ID kosong",

      prediction:null

    };
  }

  try {

    const data =
      await apiGet(

        "/predictions",

        {
          fixture:
            fixtureId
        }

      );

    const prediction =
      Array.isArray(
        data?.response
      )
        ? data.response[0]
        : null;

    if (!prediction){

      return {

        ok:false,

        error:
          "Prediction tidak tersedia",

        prediction:null

      };
    }

    return {

      ok:true,

      error:null,

      prediction

    };

  } catch (err){

    return {

      ok:false,

      error:

        err?.response?.data?.message ||

        err?.response?.data ||

        err.message ||

        "Failed fetch prediction",

      prediction:null

    };
  }
}

export async function getBatchPredictions(fixtures = []){

  const maxFixtures =
    Number(
      process.env.AUTO_PARLAY_MAX_FIXTURES ||
      20
    );

  const selected =
    fixtures.slice(0, maxFixtures);

  const results =
    await Promise.all(

      selected.map(async row => {

        const fixtureId =
          row?.fixture?.id;

        const predictionResult =
          await getPredictionByFixture(
            fixtureId
          );

        return {

          fixtureId,

          ok:
            predictionResult.ok,

          prediction:
            predictionResult.prediction

        };
      })

    );

  return results;
}

export function normalizePrediction(prediction){

  const p =
    prediction?.predictions ||
    {};

  const winner =
    p?.winner ||
    {};

  const goals =
    p?.goals ||
    {};

  const percent =
    p?.percent ||
    {};

  const advice =
    p?.advice ||
    "";

  const underOver =
    p?.under_over ||
    "";

  let pick = "X";

  if (

    winner?.comment &&
    /home|win/i.test(
      winner.comment
    )

  ){

    pick = "1";

  }

  if (

    winner?.comment &&
    /away/i.test(
      winner.comment
    )

  ){

    pick = "2";

  }

  const homeGoals =
    Number(
      goals?.home || 1
    );

  const awayGoals =
    Number(
      goals?.away || 1
    );

  if (
    homeGoals > awayGoals
  ){
    pick = "1";
  }

  else if (
    awayGoals > homeGoals
  ){
    pick = "2";
  }

  else {
    pick = "X";
  }

  return {

    pick,

    advice,

    underOver:
      underOver ||
      (
        homeGoals + awayGoals >= 3
          ? "OVER 2.5"
          : "UNDER 2.5"
      ),

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

export function normalizeFixture(row){

  const homeName =
    row?.teams?.home?.name ||
    "Home";

  const awayName =
    row?.teams?.away?.name ||
    "Away";

  const homeLogo =
    row?.teams?.home?.logo ||
    "";

  const awayLogo =
    row?.teams?.away?.logo ||
    "";

  const leagueName =
    row?.league?.name ||
    "Liga";

  const leagueLogo =
    row?.league?.logo ||
    "";

  const country =
    row?.league?.country ||
    "";

  const fixtureDate =
    row?.fixture?.date ||
    "";

  const fixtureTimestamp =
    row?.fixture?.timestamp ||
    0;

  const fixtureStatus =
    row?.fixture?.status?.short ||
    "";

  const fixtureId =
    row?.fixture?.id ||
    `${homeName}-${awayName}`;

  return {

    id:
      fixtureId,

    date:
      fixtureDate,

    timestamp:
      fixtureTimestamp,

    status:
      fixtureStatus,

    league:
      leagueName,

    leagueLogo:
      leagueLogo,

    country:
      country,

    home:
      homeName,

    away:
      awayName,

    homeLogo:
      homeLogo,

    awayLogo:
      awayLogo

  };
}
