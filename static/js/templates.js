'use strict';
// Шаблоны новых документов
window.CWTemplates = (() => {
  const TNR = "font-family: 'Times New Roman', Tinos, serif; font-size: 14pt; line-height: 1.5";
  const G = `${TNR}; text-indent: 1.25cm; text-align: justify; margin: 0`;
  const GC = `${TNR}; text-align: center; margin: 0`;
  const GH = `${TNR}; font-weight: bold; color: #000000; text-align: center; margin: 0 0 12pt; text-transform: uppercase`;
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return [
    {
      id: 'blank', name: 'Новый документ', desc: 'Чистый лист',
      build: () => ({ title: 'Новый документ', content: '<p><br></p>', settings: {} }),
    },
    {
      id: 'essay', name: 'Реферат по ГОСТ', desc: 'Times New Roman 14, интервал 1,5',
      build: () => ({
        title: 'Реферат',
        settings: { margins: { top: 20, right: 15, bottom: 20, left: 30 }, pageNumbers: 'bottom-center' },
        content: [
          `<p style="${GC}">МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ</p>`,
          `<p style="${GC}">Название учебного заведения</p>`,
          `<p style="${GC}">Кафедра «Название кафедры»</p>`,
          `<p style="${GC}"><br></p>`.repeat(6),
          `<p style="${GC}; font-weight: bold; font-size: 16pt">РЕФЕРАТ</p>`,
          `<p style="${GC}">по дисциплине «Название дисциплины»</p>`,
          `<p style="${GC}">на тему: «Тема работы»</p>`,
          `<p style="${GC}"><br></p>`.repeat(5),
          `<p style="${TNR}; text-align: right; margin: 0">Выполнил: студент группы ___<br>Фамилия И. О.</p>`,
          `<p style="${TNR}; text-align: right; margin: 0">Проверил: должность<br>Фамилия И. О.</p>`,
          `<p style="${GC}"><br></p>`.repeat(4),
          `<p style="${GC}">Город ${year}</p>`,
          '<div class="page-break" contenteditable="false"></div>',
          `<h1 style="${GH}">Содержание</h1>`,
          `<p style="${TNR}; margin: 0">Введение</p><p style="${TNR}; margin: 0">1 Название первой главы</p><p style="${TNR}; margin: 0">2 Название второй главы</p><p style="${TNR}; margin: 0">Заключение</p><p style="${TNR}; margin: 0">Список использованных источников</p>`,
          '<div class="page-break" contenteditable="false"></div>',
          `<h1 style="${GH}">Введение</h1>`,
          `<p style="${G}">Актуальность темы исследования обусловлена… Цель работы — … Для достижения цели поставлены следующие задачи: …</p>`,
          '<div class="page-break" contenteditable="false"></div>',
          `<h1 style="${GH}">1 Название первой главы</h1>`,
          `<p style="${G}">Текст первой главы. Абзацный отступ 1,25 см, выравнивание по ширине, полуторный интервал.</p>`,
          '<div class="page-break" contenteditable="false"></div>',
          `<h1 style="${GH}">Заключение</h1>`,
          `<p style="${G}">В ходе работы были решены поставленные задачи…</p>`,
          '<div class="page-break" contenteditable="false"></div>',
          `<h1 style="${GH}">Список использованных источников</h1>`,
          `<ol><li style="${TNR}; text-align: justify">Фамилия И. О. Название книги. — Город: Издательство, ${year - 1}. — 250 с.</li><li style="${TNR}; text-align: justify">Название сайта [Электронный ресурс]. — URL: https://example.com (дата обращения: ${new Date().toLocaleDateString('ru-RU')}).</li></ol>`,
        ].join(''),
      }),
    },
    {
      id: 'letter', name: 'Деловое письмо', desc: 'Официальное письмо',
      build: () => ({
        title: 'Деловое письмо',
        settings: {},
        content: [
          '<p style="text-align: right; margin: 0">Генеральному директору<br>ООО «Компания»<br>Иванову И. И.</p>',
          '<p><br></p>',
          `<p style="margin: 0">Исх. № ___ от ${today}</p>`,
          '<p><br></p>',
          '<p style="text-align: center"><b>Уважаемый Иван Иванович!</b></p>',
          '<p style="text-indent: 1.25cm; text-align: justify">Настоящим письмом сообщаем Вам о… Просим рассмотреть возможность…</p>',
          '<p style="text-indent: 1.25cm; text-align: justify">Будем признательны за ответ в срок до…</p>',
          '<p><br></p>',
          '<p style="margin: 0">С уважением,</p>',
          '<p style="margin: 0">Должность</p>',
          '<p style="margin: 0">Фамилия И. О. ____________</p>',
        ].join(''),
      }),
    },
    {
      id: 'resume', name: 'Резюме', desc: 'Современное резюме',
      build: () => ({
        title: 'Резюме',
        settings: { margins: { top: 15, right: 18, bottom: 15, left: 18 } },
        content: [
          '<p class="cw-title" style="color: #2f3a8f">Иван Иванов</p>',
          '<p class="cw-subtitle">Должность, на которую претендуете</p>',
          '<p style="margin: 0">+7 (900) 000-00-00 · ivan@example.com · Москва</p>',
          '<hr>',
          '<h2>О себе</h2>',
          '<p>Кратко опишите опыт, сильные стороны и чем вы будете полезны компании.</p>',
          '<h2>Опыт работы</h2>',
          `<p style="margin: 0"><b>Компания</b> — Должность</p><p style="color: #6b6b6b; margin: 0">${year - 3} — настоящее время</p>`,
          '<ul><li>Достижение с цифрами: увеличил продажи на 30%.</li><li>Ключевая обязанность или проект.</li></ul>',
          '<h2>Образование</h2>',
          `<p style="margin: 0"><b>Университет</b> — Специальность</p><p style="color: #6b6b6b">${year - 8} — ${year - 4}</p>`,
          '<h2>Навыки</h2>',
          '<table class="cw-table-plain" style="width: 100%"><tbody><tr><td><ul><li>Навык 1</li><li>Навык 2</li></ul></td><td><ul><li>Навык 3</li><li>Навык 4</li></ul></td></tr></tbody></table>',
          '<p><br></p>',
        ].join(''),
      }),
    },
    {
      id: 'report', name: 'Отчёт', desc: 'Структурированный отчёт',
      build: () => ({
        title: 'Отчёт',
        settings: { pageNumbers: 'bottom-right', header: 'Отчёт о работе' },
        content: [
          '<p class="cw-title">Отчёт о работе</p>',
          `<p class="cw-subtitle">${today}</p>`,
          '<h1>Краткие итоги</h1>',
          '<p>Опишите главное в 2–3 предложениях: что сделано, каков результат и что дальше.</p>',
          '<h1>Показатели</h1>',
          '<table class="cw-table-accent" style="width: 100%"><tbody><tr><td>Показатель</td><td>План</td><td>Факт</td><td>Выполнение</td></tr><tr><td>Выручка</td><td>1 000 000</td><td>1 150 000</td><td>115%</td></tr><tr><td>Новые клиенты</td><td>40</td><td>36</td><td>90%</td></tr><tr><td>Средний чек</td><td>25 000</td><td>31 900</td><td>128%</td></tr></tbody></table>',
          '<h1>Выводы</h1>',
          '<ol><li>Первый вывод.</li><li>Второй вывод.</li></ol>',
          '<h1>Следующие шаги</h1>',
          '<ul class="cw-checklist"><li>Задача на следующий период</li><li>Ещё одна задача</li></ul>',
        ].join(''),
      }),
    },
    {
      id: 'notes', name: 'Заметки и задачи', desc: 'Список дел',
      build: () => ({
        title: 'Заметки',
        settings: { margins: { top: 20, right: 20, bottom: 20, left: 20 } },
        content: [
          `<h1>Заметки · ${today}</h1>`,
          '<h3>Сегодня</h3>',
          '<ul class="cw-checklist"><li data-checked="">Проверить почту</li><li>Подготовить презентацию</li><li>Позвонить клиенту</li></ul>',
          '<h3>Идеи</h3>',
          '<ul><li>Запишите идею здесь</li></ul>',
          '<p class="cw-quote">Маленькие шаги каждый день.</p>',
        ].join(''),
      }),
    },
  ];
})();
