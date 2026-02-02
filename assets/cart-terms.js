document.addEventListener("DOMContentLoaded", function () {
  const termsCheckbox = document.getElementById("terms-checkbox");
  const checkoutButton = document.getElementById("checkout");
  const errorMessage = document.querySelector(".cart__terms-error");

  if (!termsCheckbox || !checkoutButton) return;

  // Estado inicial: botón deshabilitado
  checkoutButton.disabled = true;

  // Escuchar cambios en el checkbox
  termsCheckbox.addEventListener("change", function () {
    checkoutButton.disabled = !this.checked;

    // Ocultar error cuando acepta
    if (this.checked && errorMessage) {
      errorMessage.style.display = "none";
    }
  });

  // Interceptar click en botón deshabilitado para mostrar error
  checkoutButton.addEventListener("click", function (e) {
    if (!termsCheckbox.checked) {
      e.preventDefault();
      if (errorMessage) {
        errorMessage.style.display = "block";
      }
    }
  });
});
