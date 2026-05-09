function predictMatch(fixture){

  const seed =
    hashNum(
      `${fixture.id}|${fixture.home}|${fixture.away}|${fixture.date}`
    );

  const homeSeed =
    hashNum(`${fixture.home}|home-power`);

  const awaySeed =
    hashNum(`${fixture.away}|away-power`);

  const leagueInfo =
    getLeaguePriority(fixture.league) || { score:70 };

  const homePower =
    50 + (homeSeed % 38);

  const awayPower =
    49 + (awaySeed % 38);

  const homeBoost =
    5 + (seed % 7);

  const leagueBoost =
    Math.round((leagueInfo.score - 70) / 7);

  const diff =
    (homePower + homeBoost + leagueBoost) - awayPower;

  let pick = "X";

  if (diff >= 9){
    pick = "1";
  }
  else if (diff <= -8){
    pick = "2";
  }

  let confidence =
    58 + Math.abs(diff);

  if (pick === "X"){
    confidence =
      56 + (seed % 9);
  }

  confidence =
    clamp(confidence, 56, 84);

  let risk = "MEDIUM";

  if (confidence >= 76){
    risk = "SAFE";
  }

  if (confidence < 64){
    risk = "RISKY";
  }

  let homeGoals =
    1 + (seed % 3);

  let awayGoals =
    1 + ((seed >> 3) % 3);

  if (pick === "1" && homeGoals <= awayGoals){
    homeGoals = awayGoals + 1;
  }

  if (pick === "2" && awayGoals <= homeGoals){
    awayGoals = homeGoals + 1;
  }

  if (pick === "X"){
    const g = (seed % 2) + 1;
    homeGoals = g;
    awayGoals = g;
  }

  homeGoals =
    clamp(homeGoals, 0, 4);

  awayGoals =
    clamp(awayGoals, 0, 4);

  const totalGoals =
    homeGoals + awayGoals;

  const ou =
    totalGoals >= 3
      ? "OVER 2.5"
      : "UNDER 3.5";

  const btts =
    homeGoals > 0 && awayGoals > 0
      ? "YES"
      : "NO";

  let pickLabel = "Seri";

  if (pick === "1"){
    pickLabel = fixture.home;
  }

  if (pick === "2"){
    pickLabel = fixture.away;
  }

  const doubleChance =
    confidence >= 76 && pick !== "X"
      ? pick
      : pick === "2"
        ? "X2"
        : "1X";

  const handicap =
    makeHandicap(pick, confidence);

  const odds =
    makeOdds(confidence, risk, seed);

  const bigMatch =
    isBigMatch(
      fixture.home,
      fixture.away,
      fixture.league
    );

  const score =
    `${homeGoals} – ${awayGoals}`;

  const timeWib =
    formatWIB(fixture.date);

  const homeLogo =
    fixture.homeLogo ||
    fixture.home_logo ||
    fixture.teams?.home?.logo ||
    "";

  const awayLogo =
    fixture.awayLogo ||
    fixture.away_logo ||
    fixture.teams?.away?.logo ||
    "";

  const analysis =
    buildAnalysis({
      seed,
      home: fixture.home,
      away: fixture.away,
      league: fixture.league,
      pick,
      pickLabel,
      confidence,
      risk,
      ou,
      btts,
      score,
      handicap,
      timeWib,
      bigMatch
    });

  return {

    match:
      `${fixture.home} vs ${fixture.away}`,

    home:fixture.home,

    away:fixture.away,

    homeLogo,

    awayLogo,

    league:fixture.league,

    pick,

    pickLabel,

    doubleChance,

    handicap,

    ou,

    btts,

    score,

    confidence,

    risk,

    odds,

    bigMatch,

    analysis,

    time:fixture.date,

    timeWib,

    fixtureId:fixture.id

  };

}

function buildAnalysis({

  seed,

  home,

  away,

  league,

  pick,

  pickLabel,

  confidence,

  risk,

  ou,

  btts,

  score,

  handicap,

  timeWib,

  bigMatch

}){

  const introTexts = [

    `${home} akan menghadapi ${away} dalam pertandingan ${league} yang berlangsung pukul ${timeWib}. Laga ini diperkirakan berjalan cukup menarik karena kedua tim sama-sama memiliki peluang untuk tampil agresif sejak awal pertandingan.`,

    `Pertandingan ${league} antara ${home} melawan ${away} menjadi salah satu laga yang cukup layak diperhatikan pada jadwal hari ini. Kedua tim diperkirakan tampil dengan tempo permainan yang cukup terbuka.`,

    `${home} dan ${away} dijadwalkan bertemu pada pertandingan ${league} malam ini. Dari susunan pertandingan yang tersedia, laga ini memiliki peluang menghadirkan permainan yang cukup kompetitif.`,

    `Duel ${home} kontra ${away} diprediksi berlangsung dengan intensitas permainan yang cukup tinggi dan menarik untuk dijadikan bahan pertimbangan parlay.`

  ];

  const pickTexts = {

    "1":[

      `${home} terlihat memiliki peluang yang lebih baik untuk mengontrol jalannya pertandingan dan tampil lebih konsisten sepanjang laga berlangsung.`,

      `Pilihan utama lebih mengarah ke kemenangan ${home} karena dinilai memiliki kestabilan permainan yang cukup baik untuk pertandingan kali ini.`,

      `${home} diperkirakan mampu tampil lebih efektif dan memiliki peluang bagus untuk mengamankan hasil positif di pertandingan ini.`,

      `Secara keseluruhan ${home} terlihat sedikit lebih unggul dan cukup layak dijadikan pilihan utama pada pertandingan ini.`

    ],

    "2":[

      `${away} memiliki peluang yang cukup baik untuk memberikan tekanan dan mencuri hasil positif pada pertandingan ini.`,

      `Pilihan pertandingan lebih condong ke ${away} karena performa permainan yang dinilai cukup menjanjikan untuk laga kali ini.`,

      `${away} diperkirakan mampu tampil disiplin dan cukup efektif saat memanfaatkan peluang yang tersedia.`,

      `Secara permainan ${away} terlihat cukup layak dipertimbangkan sebagai pilihan utama untuk pertandingan ini.`

    ],

    "X":[

      `Kedua tim diprediksi tampil cukup seimbang sehingga peluang hasil imbang masih terbuka cukup besar.`,

      `Pertandingan ini diperkirakan berjalan ketat dan tidak mudah didominasi oleh salah satu pihak.`,

      `${home} dan ${away} sama-sama memiliki peluang sehingga hasil akhir seri menjadi salah satu opsi yang cukup menarik.`,

      `Melihat kekuatan kedua tim yang cukup berimbang, pertandingan ini berpotensi berakhir dengan skor ketat.`

    ]

  };

  const trustTexts = [

    `Prediksi ini masuk dalam kategori ${risk.toLowerCase()} dengan estimasi tingkat keyakinan mencapai ${confidence}%.`,

    `Pilihan ini dinilai cukup menarik berdasarkan peluang permainan, susunan pertandingan, serta arah market yang tersedia.`,

    `Secara keseluruhan pertandingan ini masih cukup layak dijadikan bahan pertimbangan untuk kombinasi parlay.`,

    `Win rate estimasi berada di kisaran ${confidence}% sehingga masih cukup menarik untuk dipantau pada market utama.`

  ];

  const marketTexts = [

    `Untuk market tambahan, pilihan ${ou} terlihat cukup menarik dengan opsi BTTS ${btts}.`,

    `Dari sisi jumlah gol, market ${ou} menjadi salah satu pilihan yang cukup layak dipertimbangkan.`,

    `Pasaran gol cenderung mengarah ke ${ou}, sementara opsi BTTS berada di posisi ${btts}.`,

    `Selain pick utama, market ${ou} dan BTTS ${btts} juga cukup menarik untuk dipadukan dalam kombinasi parlay.`

  ];

  const closingTexts = [

    `Handicap yang direkomendasikan berada di angka ${handicap} dengan prediksi skor akhir ${score}.`,

    `Prediksi skor pertandingan mengarah ke hasil ${score} dengan handicap ${handicap}.`,

    `Estimasi skor akhir pertandingan ini adalah ${score}.`,

    `Pilihan handicap ${handicap} masih cukup layak dipertimbangkan untuk market tambahan.`

  ];

  const bigMatchText =
    bigMatch
      ? ` Pertandingan ini juga termasuk kategori big match dan diperkirakan akan menjadi salah satu laga dengan perhatian paling tinggi hari ini.`
      : "";

  return [

    seededPick(seed, introTexts),

    seededPick(seed >> 2, pickTexts[pick]),

    seededPick(seed >> 4, trustTexts),

    seededPick(seed >> 6, marketTexts),

    seededPick(seed >> 8, closingTexts) + bigMatchText

  ].join(" ");

}

function makeTableRows(matches){

  return matches.map((m, i)=>`

<tr>

  <td>${i + 1}</td>

  <td>

    <div class="match-cell">

      <div class="team-row">

        ${
          m.homeLogo
            ? `
              <img
                src="${m.homeLogo}"
                alt="${m.home}"
                class="team-logo"
              >
            `
            : ``
        }

        <span>${m.home}</span>

      </div>

      <div class="vs-text">
        VS
      </div>

      <div class="team-row">

        ${
          m.awayLogo
            ? `
              <img
                src="${m.awayLogo}"
                alt="${m.away}"
                class="team-logo"
              >
            `
            : ``
        }

        <span>${m.away}</span>

      </div>

      ${
        m.bigMatch
          ? `
            <div class="big-match-badge">
              🔥 BIG MATCH
            </div>
          `
          : ``
      }

      <div class="match-time">
        ${m.timeWib}
      </div>

    </div>

  </td>

  <td>${m.pickLabel}</td>

  <td>${m.doubleChance}</td>

  <td>${m.handicap}</td>

  <td>${m.ou}</td>

  <td>${m.btts}</td>

  <td>${m.score}</td>

  <td>${m.confidence}%</td>

  <td>${m.odds}</td>

  <td>${m.risk}</td>

</tr>

`).join("");

}
