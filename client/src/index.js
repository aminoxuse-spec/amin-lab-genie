(function () {
        App.applyLogo();
        if (App.token) location.replace('/dashboard.html');

        var form = document.getElementById('loginForm');
        var button = document.getElementById('submitBtn');

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          button.disabled = true;
          button.textContent = 'جارٍ الدخول…';
          App.api('/auth/login', {
            method: 'POST',
            body: {
              username: document.getElementById('username').value.trim(),
              password: document.getElementById('password').value
            }
          })
            .then(function (data) {
              App.saveSession(data.token, data.user);
              location.replace('/dashboard.html');
            })
            .catch(function (error) {
              App.toast(error.message, 'error');
              button.disabled = false;
              button.textContent = 'دخول';
            });
        });

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        }
      })();
