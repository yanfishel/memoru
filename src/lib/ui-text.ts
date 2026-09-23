/** Every Russian string the UI shows. Code stays English; this is data. */
export const UI = {
  /** The site's own name. It is not "Открытый список": that is the separate project whose data this
      site presents, credited in the footer and on /about, never claimed as this site's identity. */
  siteName: "MEMOru",
  siteTitle: "MEMOru — имена и цифры репрессий в СССР",
  siteTagline: "Люди, репрессированные в СССР по политическим мотивам: поиск по имени, статистика, карта",
  /** Descriptions for search results and social cards. Deliberately free of counts: a number here
      goes stale in a search index between data builds, and reading one costs another query. */
  meta: {
    home: "Поиск по имени среди миллионов людей, репрессированных в СССР по политическим мотивам, "
      + "статистика по годам, приговорам и регионам, карта. По данным базы «Открытый список», CC BY-SA.",
    explore: "Распределения по годам ареста, приговорам, полу, образованию, национальности и регионам, "
      + "с фильтрами и картой. По данным базы «Открытый список», CC BY-SA.",
    search: "Поиск репрессированных по фамилии, имени и отчеству. Опечатки не важны, Ё и Е равны, "
      + "есть фильтры по году ареста и региону. По данным базы «Открытый список», CC BY-SA.",
    /** Alt text for the social cards: what a screen reader or a failed image load should say. */
    ogAlt: "MEMOru — имена и цифры репрессий в СССР",
    /** The line along the bottom of every social card. */
    ogSource: "По данным базы «Открытый список» · CC BY-SA",
  },
  nav: { explore: "Цифры", search: "Поиск", map: "Карта", menu: "Меню" },
  theme: { title: "Тема", light: "Светлая", dark: "Тёмная", auto: "Как в системе" },
  footer: {
    /** Plain text before the link in `sourceName` — never part of the link itself. */
    sourceLabel: "Данные:",
    /** The linked text alone (href: https://ru.openlist.wiki). */
    sourceName: "Открытый список",
    /** Plain text before the link in `licence` — never part of the link itself. */
    licenceLabel: "Лицензия:",
    licence: "CC BY-SA 4.0",
    /** Combines its own "Состояние данных: " label with the value (unlike sourceLabel/licenceLabel
        above) because the null case is a whole different sentence, not "Состояние данных: не указано". */
    dataDate: (date: string | null) => (date ? `Состояние данных: ${date}` : "Дата данных не указана"),
    description: "База данных людей, репрессированных в СССР по политическим мотивам.",
    boundaries: "Границы регионов современные и лишь приблизительно соответствуют советским; Крым показан в составе Украины.",
    collapse: "Записи Московской и Ленинградской областей объединены с Москвой и Санкт-Петербургом — так они помечены в источнике.",
    about: "О проекте",
    sourceHeading: "Источник",
    /** The lockup right above already names the site, so the line carries the year and the sign only. */
    copyright: (year: number) => `${year} ©`,
    madeWith: "Made with",
    madeFor: "for Web",
    mail: "Написать письмо",
    mailSubject: "Открытый список: вопрос",
    github: "Исходный код на GitHub",
    fishart: "fishart.co.il",
  },
  notStated: "не указано",
  /** The same words opening a sentence, for a note that reads "… Не указано: 12." */
  notStatedCap: "Не указано",
  unrecognized: "не распознано",
  /** The pie chart's merged label for "не указано" + "не распознано" (spec §1 addendum): one slice
      reads better than two thin grey wedges that mean the same thing to a reader. One word, not
      «не известно» — as a standalone predicative adverb "неизвестно" is spelled together; the split
      form is only correct under explicit contrast, which this is not. */
  notKnown: "неизвестно",
  searchUnavailable: "Поиск временно недоступен. Главная страница и карточки людей работают.",
  home: {
    title: "Найти имя",
    titleAccent: "Понять масштаб",
    lead: (persons: string) => `В\u00A0базе — ${persons} человек, репрессированных в\u00A0СССР по\u00A0политическим мотивам.`,
    featured: {
      label: "Одно имя из трёх миллионов",
      born: (year: number, place: string | null) => (place ? `${year}, ${place}` : `${year} г. р.`),
      arrested: (date: string) => `Арестован ${date}.`,
      arrestedF: (date: string) => `Арестована ${date}.`,
      steps: { born: "родился", bornF: "родилась", arrest: "арест", verdict: "приговор", death: "смерть", rehab: "реабилитация" },
    },
    persons: "человек",
    executed: "расстреляны",
    rehabilitated: "реабилитированы",
    cases: "дел",
    story: {
      title: "История в цифрах",
      terror: {
        heading: (from: number, to: number) => `${from}–${to}`,
        text: (share: string, inRange: string) => `Два года Большого террора дают ${share} всех арестов с известным годом: ${inRange} человек. Ниже — как это распределилось по приговорам и регионам.`,
        chart: "Аресты по годам",
        /** Explains why this chart's own trailing years are cut (home page only, trimmedYearRange in
            home-view.ts) — without it a chart that stops years before the data ends would read as
            "no arrests after this point", which is false. */
        tailNote: "График обрывается там, где аресты становятся единичными случаями: весь период — на странице «Цифры».",
        link: "Смотреть по годам с фильтрами →",
      },
      sentences: {
        heading: "Приговоры",
        /** The section's first paragraph: the sentence-outcomes line, plus the confirmed-executions
            count when the `executed_confirmed` aggregate exists (explains why the "расстреляны" stat
            card is smaller than the "расстрел" bar here: not every death sentence has a recorded
            execution). `confirmed` is null on an older serving schema that predates the aggregate key
            (see Story.tsx / executedConfirmedCount) — the paragraph then ends after "исхода." with no
            dangling text, rather than showing a false zero. */
        text: (confirmed: string | null) =>
          `Расстрел, лагерь, ссылка и спецпоселение — три самых частых исхода.${confirmed ? ` Из приговорённых к расстрелу казнь подтверждена для ${confirmed} человек.` : ""}`,
        /** The section's second paragraph. */
        sexText: "Рядом — распределение по полу: женщин в базе чуть больше четверти.",
        sentence: "Приговор",
        sex: "Пол",
        link: "Смотреть приговоры с фильтрами →",
      },
      geography: {
        heading: "География",
        text: "Регион источника, из книги памяти которого пришла запись.",
        /** The home page's own map title — a separate string from the "Цифры" page's source-region
            naming (dimensions.ts's titleRu, and `UI.explore.mapLayer.source_region`, next to that
            page's layer switcher), kept apart because the two pages can retitle independently even
            though a 2026-09-18 rename left both reading "Источник" today; that overlap is coincidence,
            not sharing. */
        map: "Источник",
        /** The home page's own, shorter combination of the map's two caveats — `UI.footer.boundaries`
            and `UI.footer.collapse` render the fuller wording inside Choropleth's own figcaption on
            the "Цифры" page (unchanged there); this is a separate string, not those two sentences
            spliced in JSX, so the punctuation lives in the data. */
        note: "Границы регионов современные и лишь приблизительно соответствуют советским. Записи Московской и Ленинградской областей объединены с Москвой и Санкт-Петербургом.",
        /** Paired with formatInt(unknownRegionCount(...)) the same way UI.notStatedCap pairs with the
            arrests chapter's unknown count (Story.tsx). */
        unknownLabel: "Регион неизвестен",
        link: "Открыть карту с фильтрами →",
      },
    },
  },
  explore: {
    title: "Цифры",
    mapLayerLabel: "Слой карты",
    mapLayer: { source_region: "Источник", birth_region: "Место рождения", residence_region: "Место жительства" },
    rateLimited: "Слишком много запросов, подождите немного.",
    yearFrom: "от",
    yearTo: "до",
    found: (n: string) => `Найдено: ${n}`,
    tabs: { charts: "Графики", map: "Карта", list: "Список" },
    chips: {
      query: (q: string) => `Имя: ${q}`,
      from: (year: number) => `с ${year}`,
      to: (year: number) => `до ${year}`,
      /** The chip half of the year filter's own "неизвестно" checkbox, so the two read the same. */
      unknownSuffix: "+ неизвестно",
      clearAll: "Сбросить всё",
      add: (title: string) => `+ ${title}`,
      more: "+ ещё",
      allFilters: "Фильтры",
      /** Sits before the chips, in the same type as the found count above them. */
      chipsLabel: "Фильтры:",
      valueSearch: "Найти значение",
      apply: "Готово",
    },
    table: {
      name: "Имя",
      born: "Родился",
      arrested: "Арест",
      sentence: "Приговор",
      region: "Регион",
      sortBy: (column: string) => `Сортировать по колонке «${column}»`,
      unsortable: "Сортировка по этой колонке появится со следующей сборкой данных",
      hasPhoto: "Есть фотография",
      range: (from: string, to: string, total: string) => `${from}–${to} из ${total}`,
      pager: { first: "В начало", previous: "Назад", next: "Дальше", last: "В конец" },
      empty: "Ничего не найдено.",
      emptyHint: "Попробуйте убрать отчество, проверить букву «ё» или снять часть фильтров.",
    },
    mapHint: "Нажмите на регион, чтобы добавить его в фильтр.",
  },
  map: {
    unavailable: "Карта временно недоступна.",
    noRegion: (n: string) => `Без региона: ${n}`,
  },
  chart: {
    otherRest: "другие",
    caveat: (share: string) => `Значение указано для ${share} записей; остальные показаны как «не указано».`,
    /** Used where the unknown/unrecognized rows are dropped from the chart entirely (`dropUnknown`):
        the maintainer asked for the covered share alone, with no clause about the rest. */
    caveatOmitted: (share: string) => `Значение указано для ${share} записей.`,
    more: "подробнее",
    firstCaseRule: "По годам ареста и возрасту учитывается первое дело человека.",
  },
  person: {
    search: "Поиск",
    details: "Сведения",
    missing: (fields: string) => `В источнике нет: ${fields}`,
    cases: "Дела",
    caseN: (n: number) => `Дело ${n}`,
    source: "Источник",
    openlist: "Страница в Открытом списке",
    corrections: "Исправления и дополнения вносятся на странице источника.",
    licence: "Данные предоставлены на условиях CC BY-SA 4.0.",
    bornIn: (year: number) => `${year} г. р.`,
    /**
     * Values the source never states in words: they reach the page as a code, and the dictionary spells
     * codes for charts and filters ("женщины", "расстреляны"). One person's card needs the singular, in
     * their own gender.
     */
    values: {
      sex: { m: "мужской", f: "женский", unknown: "не указан", unrecognized: "не распознан" },
      fate: {
        executed: ["расстрелян", "расстреляна"],
        died: ["умер", "умерла"],
        unknown: "не указана",
        unrecognized: "не распознана",
      },
    },
    fields: {
      sex: "Пол",
      birthDate: "Дата рождения",
      birthPlace: "Место рождения",
      residence: "Место проживания",
      nationality: "Национальность",
      education: "Образование",
      party: "Партийность",
      sourceRegion: "Регион источника",
      fate: "Судьба",
      ageAtDeath: "Возраст на момент смерти",
      arrestDate: "Дата ареста",
      conviction: "Осуждение",
      court: "Осудивший орган",
      article: "Статья",
      sentence: "Приговор",
      rehabDate: "Дата реабилитации",
      rehabBody: "Реабилитирующий орган",
    },
    lifeYears: (born: number, died: number) => `${born} — ${died}`,
    narrative: {
      born: ["Родился", "Родилась"],
      birthPlace: (place: string) => `место рождения — ${place}`,
      birthPlaceAlone: (place: string) => `Место рождения — ${place}.`,
      lived: ["Проживал", "Проживала"],
      nationality: (v: string) => `национальность — ${v}`,
      education: (v: string) => `образование — ${v}`,
      party: (v: string) => `партийность — ${v}`,
      caseN: (n: number) => `Дело ${n}.`,
      arrested: ["Арестован", "Арестована"],
      convicted: ["Осуждён", "Осуждена"],
      court: (v: string) => `осудивший орган — ${v}`,
      article: (v: string) => `статья — ${v}`,
      sentence: (v: string) => `Приговор — ${v}`,
      missing: { court: ["осудивший орган", "m"], article: ["статья", "f"], sentence: ["приговор", "m"] } as const,
      notStatedOne: { m: "в источнике не указан", f: "в источнике не указана" },
      notStatedMany: "в источнике не указаны",
      noCases: "Сведений о делах в источнике нет.",
      executed: ["Расстрелян", "Расстреляна"],
      died: ["Умер", "Умерла"],
      inYear: (year: number) => `в ${year} году`,
      inMonth: (month: string, year: number) => `в ${month} ${year} года`,
      /** `word` is the genitive: "в возрасте 21 года", "в возрасте 86 лет". */
      aged: (age: number, word: string) => `в возрасте ${age} ${word}`,
      diedUnknown: ["Умер; дата смерти в источнике не указана.", "Умерла; дата смерти в источнике не указана."],
      rehabilitated: ["Реабилитирован", "Реабилитирована"],
      /** The case number leads, so it never stands next to the date: "По делу 2 реабилитирован 12.05.1957." */
      rehabilitatedCase: (n: number): readonly [string, string] => [`По делу ${n} реабилитирован`, `По делу ${n} реабилитирована`],
      noRehab: "Сведений о реабилитации нет.",
      noRehabCases: (ns: readonly number[]) =>
        ns.length === 1
          ? `Сведений о реабилитации по делу ${ns[0]} нет.`
          : `Сведений о реабилитации по делам ${ns.slice(0, -1).join(", ")} и ${ns[ns.length - 1]} нет.`,
    },
    badges: {
      arrest: (year: number) => `Арест ${year}`,
      executed: ["Расстрелян", "Расстреляна"],
      rehabilitated: (year: number | null): readonly [string, string] =>
        (year === null ? ["Реабилитирован", "Реабилитирована"] : [`Реабилитирован ${year}`, `Реабилитирована ${year}`]),
      noRehab: "Реабилитация не указана",
    },
    timeline: { title: "Судьба", born: "родился", bornF: "родилась", arrest: "арест", sentence: "приговор", executed: "расстрел", died: "смерть", rehab: "реабилитация" },
    /** Used by the print-only page-URL line in PersonCard (spec §5.1). The other fields this object
        used to carry (fields/cases/caseN/source/openlist/photo/data/dataDate) were the TXT export's
        own labels; they lost their last caller when `person-text.ts` was removed on 2026-09-18. */
    text: { link: "Ссылка" },
    actions: { print: "Печать", share: "Поделиться" },
    share: {
      title: "Поделиться",
      system: "Поделиться…",
      copy: "Скопировать ссылку",
      copied: "Скопировано",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      vk: "ВКонтакте",
      ok: "Одноклассники",
      x: "X",
      facebook: "Facebook",
      email: "Письмо",
      subject: (name: string) => `Открытый список: ${name}`,
    },
    similar: { title: "Похожие записи", hint: "Та же фамилия и имя, год рождения в пределах трёх лет." },
    months: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
    /** The prepositional case, for prose: "в апреле 1892 года". */
    monthsPrep: ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"],
    /** The genitive case, for a day + month + year date: "15 сентября 2026" (footer's data-date line). */
    monthsGen: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    years: ["год", "года", "лет"],
    /** The genitive after "в возрасте": singular for 1, 21, 31…, plural otherwise. */
    yearsGenitive: ["года", "лет"],
    monthsOfTerm: ["месяц", "месяца", "месяцев"],
  },
  search: {
    title: "Поиск по имени",
    placeholder: "Фамилия Имя Отчество",
    submit: "Найти",
    clear: "Очистить",
  },
  about: {
    title: "О проекте",
    lead: "Этот сайт показывает в цифрах, на карте и по именам людей, репрессированных в СССР по политическим мотивам, по данным базы «Открытый список».",
    sections: [
      {
        title: "Откуда данные",
        text: [
          "Источник — база «Открытый список» (ru.openlist.wiki), которая собирает записи из региональных книг памяти, баз «Мемориала» и других опубликованных источников. Данные предоставлены на условиях лицензии CC BY-SA 4.0.",
          "Первая загрузка сделана из полного дампа базы за март 2023 года; дальше сайт обновляется раз в месяц из API «Открытого списка». Правки, которые вносит служебный робот базы, после апреля 2023 года не учитываются; правки людей учитываются все.",
          "Исправления и дополнения к записям вносятся на страницах «Открытого списка»; на каждой карточке есть ссылка на страницу источника.",
        ],
      },
      {
        title: "Как считаются цифры",
        text: [
          "Каждое значение, которого нет в источнике, показано как «не указано», а значение, которое не удалось отнести к словарю, — как «не распознано». Ни то ни другое не отбрасывается: доли «не указано» видны на каждом графике.",
          "У части людей несколько дел. По годам ареста и возрасту на момент ареста учитывается первое дело человека.",
          "Под графиком, где значение заполнено меньше чем у 90% записей, стоит оговорка с точной долей заполненных записей.",
        ],
      },
      {
        title: "Карта",
        text: [
          "Границы регионов современные и лишь приблизительно соответствуют советским. Крым показан в составе Украины.",
          "Записи Московской и Ленинградской областей объединены с Москвой и Санкт-Петербургом — так они помечены в источнике.",
          "Записи, у которых регион не указан или не распознан, на карте не показаны; их число выведено под картой.",
        ],
      },
      {
        title: "Связь",
        text: ["Вопросы и замечания по сайту — по почте или в репозитории на GitHub; ссылки в подвале страницы. Замечания к данным — на страницах «Открытого списка»."],
      },
    ],
  },
  notFound: { title: "Страница не найдена", home: "На главную", hint: "Попробуйте найти человека по имени:" },
} as const;
