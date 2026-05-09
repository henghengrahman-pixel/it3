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

    const res =
      await axios.get(

        `${apiBaseUrl().replace(/\/+$/, "")}/fixtures`,

        {
          headers:
            headers(),

          params:{
            date
          },

          timeout:
            Number(
              process.env.FOOTBALL_API_TIMEOUT ||
              15000
            )
        }
      );

    return {

      ok:true,

      error:null,

      fixtures:
        Array.isArray(
          res.data?.response
        )
          ? res.data.response
          : []

    };

  } catch (err){

    return {

      ok:false,

      error:
        err?.response?.data?.message ||
        err?.response?.data ||
        err.message,

      fixtures:[]

    };
  }
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
