(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  // работаем только внутри Telegram, в обычном браузере ничего не меняем
  if (!tg || !tg.initData) return;

  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
  try {
    tg.setHeaderColor("#ffe4ec");
    tg.setBackgroundColor("#ffe4ec");
  } catch (e) {}

  // Узнаём игрока по его аккаунту Telegram
  var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (user && user.id) {
    try {
      localStorage.setItem("tamolove_id", "tg" + user.id);
      if (!localStorage.getItem("tamolove_name") && user.first_name) {
        localStorage.setItem("tamolove_name", String(user.first_name).slice(0, 12));
      }
    } catch (e) {}
  }

  // Кнопка «Пригласить» открывает окно пересылки в Telegram
  try {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: function (data) {
        var text = (data && data.text) || "";
        var m = text.match(/Код: ([A-Z0-9]+)/);
        var code = m ? m[1] : "";
        var msg =
          "Заходи в наш дом в TamoLove! Открой бота, нажми «Играть» и введи код: " +
          code;
        var url =
          "https://t.me/share/url?url=" +
          encodeURIComponent("https://t.me/TamoLoveGameBot") +
          "&text=" +
          encodeURIComponent(msg);
        tg.openTelegramLink(url);
        return Promise.resolve();
      }
    });
  } catch (e) {}
})();
