# ParcelBot — итоговый визуальный макет

- [Единая дизайн-доска PNG](parcelbot-design-board.png): **3520 × 9294 px**, масштаб 2×.
- [HTML-версия](index.html): открыть в браузере; каждый кадр кликабелен и открывается отдельно.
- [Исходные кадры](screens/): 8 desktop и 4 mobile PNG, снятые непосредственно с текущего frontend/.
- [Manifest](capture-manifest.json): параметры съёмки, состояния, размеры и SHA-256 кадров и исходников.
- [Скрипт воспроизведения](capture-board.mjs).

Для передачи HTML сохраняйте всю папку final вместе с screens/. Общий PNG самодостаточен.

## Состав

1. Форма ввода параметров в тёмной и светлой темах.
2. Список отправок по дате в обеих темах, с категориями express/heavy/standard.
3. Loading сохранения, success, empty и error с повтором загрузки.
4. Мобильные форма, список, пустой результат и ошибка.

Съёмка: Playwright Chromium, desktop viewport 1280 × 900, mobile 375 × 812, полная высота страницы, deviceScaleFactor 2, locale ru-RU, LANGUAGE=ru_RU:ru. Все кадры — реальный рендер приложения, без изменения его CSS/DOM. Внешние шрифты блокируются; используется предусмотренный приложением системный fallback. Анимации отключены только на время screenshot.

Ответы WF1/WF2 подменены фикстурами на api.example.test, прочий внешний трафик блокируется. Production n8n не вызывался. Моковые записи — иллюстрация интерфейса, не данные из production. Скрипт проверил неизменность исходников, старых скриншотов, README и ZIP по SHA-256.

## Происхождение и статус

Доска подготовлена Codex по фактическому заданию пользователя: «Подготовь итоговый визуальный макет ParcelBot на основе уже реализованного React-интерфейса». AI организовал реальные Playwright-кадры в HTML-доску и экспортировал её в PNG; дизайн приложения не реконструировался по описанию.

Это **статический визуальный экспорт текущей реализации**, не редактируемый Figma-файл и не подтверждение изменения исходного Figma Make. [Исходный Figma Make](https://www.figma.com/make/7z26BI2zEUfAOxPbj4LIDR/ParcelBot-Parcel-Planning-Interface?t=v91Hh0vUxpOwoAKm-1) и [ZIP-экспорт](../ParcelBot%20Parcel%20Planning%20Interface.zip) сохранены без изменений.

## Повторное создание

При уже установленных зависимостях frontend и Chromium из корня репозитория:

```bash
node docs/design/final/capture-board.mjs
```

На проверенной Ubuntu без системных библиотек Chromium используется только собственный кэш ParcelBot:

```bash
LD_LIBRARY_PATH="$PWD/frontend/.cache/browser-libs/usr/lib/x86_64-linux-gnu" node docs/design/final/capture-board.mjs
```

Скрипт запускает отдельный Vite на 15174 с фиктивным адресом API и останавливает свой сервер в finally. Он перезаписывает только результаты в docs/design/final/. Git index не изменяется.
