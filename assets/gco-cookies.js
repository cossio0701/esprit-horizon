document.addEventListener("DOMContentLoaded", function () {
  const cookieName = "tplCookieConsent";
  const cookieLifetime = 60;

  const banner = document.querySelector(".gco-cookie-banner");
  const button = document.querySelector(".gco-cookie-banner__button");

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + value + ";path=/;expires=" + d.toUTCString();
  }

  function getCookie(name) {
    const value = "; " + document.cookie;
    const parts = value.split("; " + name + "=");
    if (parts.length === 2) return parts.pop().split(";").shift();
  }

  if (!getCookie(cookieName)) {
    banner.style.opacity = "1";
  }

  button.addEventListener("click", function () {
    const consentObject = {
      analytics: true,
      statistics: true,
      marketing: true,
      preferences: true,
    };

    setCookie("CookieConsent", JSON.stringify(consentObject), cookieLifetime);
    setCookie(cookieName, 1, cookieLifetime);

    window.dispatchEvent(
      new CustomEvent("cookieConsentUpdate", {
        detail: consentObject,
      }),
    );

    banner.style.opacity = "0";
  });
});
