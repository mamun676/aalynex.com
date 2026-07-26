// ════════════════════════════════════
//  MAIN — app init, logo drag, Tawk.to, auto-scroll observer
//  Yeh file SABSE LAST load honi chahiye.
// ════════════════════════════════════

/* ── INIT ── */
window.addEventListener('load', async () => {
  // ✅ Public profile view: normal app init ko skip karo.
  // publicProfile.js ka guard route render kar dega (?profile=<id>).
  if (window.isPublicProfileView) return;

  if (supaClient) {
    try {
      const { data: { session } } = await supaClient.auth.getSession();
      if (session) {
        const { data: profile } = await supaClient
          .from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          const u = {
            id: profile.id,
            name: profile.name || session.user.email.split('@')[0],
            email: session.user.email,
            phone: profile.phone || '',
            role: profile.role || 'creator',
            profession: profile.profession || '',
            platform: profile.platform || '',
            avatar: (profile.name || 'U').charAt(0).toUpperCase(),
            createdAt: new Date(profile.created_at).getTime()
          };
          loginSuccess(u);
          return;
        }
      }
    } catch (e) {}
  }

  showScreen('screen-landing');
  // NOTE: chat auto-scroll chat.js ke renderMsgs/sendMsg me already handle hota hai.
  // Pehle yahan poore document.body par ek MutationObserver tha (subtree:true) jo
  // har DOM change + Tawk.to widget ki har animation par fire hota tha -> heavy lag/flicker.
  // Use hata diya gaya hai.
});

/* ── LOGO DRAG (share current URL) ── */
(function initLogoDrag() {
  const logo = document.getElementById("logoDrag");
  if (!logo) return;
  logo.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/uri-list", window.location.href);
    e.dataTransfer.setData("text/plain", window.location.href);
  });
})();

/* ── TAWK.TO LIVE CHAT WIDGET ── */
var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();
(function () {
  var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
  s1.async = true;
  s1.src = 'https://embed.tawk.to/69ecc801c8db451c3144265b/1jn2eqi8p';
  s1.charset = 'UTF-8';
  s1.setAttribute('crossorigin', '*');
  s0.parentNode.insertBefore(s1, s0);
})();

/* ── BACK-BUTTON / HISTORY ROUTER ──
   Pehle har in-app navigation sirf CSS class toggle karta tha, koi history
   entry nahi banti thi -> phone ka back button poora site/tab band kar deta tha.
   Ab har screen/page navigation ek history entry push karti hai (showScreen +
   cPage/fPage me) aur yeh handler back press par app ke andar hi navigate karta hai. */
(function initBackButtonRouter() {
  try { history.replaceState({ view: 'landing' }, ''); } catch (e) {}
  window.addEventListener('popstate', (e) => {
    const st = e.state || { view: 'landing' };
    window._navigatingBack = true;
    try {
      if (st.view === 'creator' && CU) {
        showScreen('screen-creator');
        cPage(st.page || 'home', document.querySelector(`#screen-creator .nav-item[data-page="${st.page || 'home'}"]`));
      } else if (st.view === 'freelancer' && CU) {
        showScreen('screen-freelancer');
        fPage(st.page || 'home', document.querySelector(`#screen-freelancer .nav-item[data-page="${st.page || 'home'}"]`));
      } else if (st.view === 'auth') {
        showScreen('screen-auth');
      } else {
        showScreen('screen-landing');
      }
    } catch (err) {
      showScreen('screen-landing');
    } finally {
      window._navigatingBack = false;
    }
  });
})();
/* ── TUF-style floating nav: scroll pe compact ── */
(function initNavScroll(){
  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    document.querySelectorAll('nav').forEach(n => {
      n.classList.toggle('scrolled', y > 20);
    });
  };
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();
})();
/* ============================================================
   FAQ accordion + category filter  (landing page)
   ============================================================ */
(function () {
  function initFAQ() {
    var rail = document.getElementById('faq-cats');
    var list = document.getElementById('faq-list');
    if (!rail || !list) return;

    function closeItem(it) {
      it.classList.remove('open');
      var a = it.querySelector('.faq-a');
      if (a) a.style.maxHeight = '';
      var q = it.querySelector('.faq-q');
      if (q) q.setAttribute('aria-expanded', 'false');
    }

    function openItem(it) {
      it.classList.add('open');
      var a = it.querySelector('.faq-a');
      if (a) a.style.maxHeight = a.scrollHeight + 'px';
      var q = it.querySelector('.faq-q');
      if (q) q.setAttribute('aria-expanded', 'true');
    }

    function showCat(cat) {
      var btns = rail.querySelectorAll('.faq-cat');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-cat') === cat;
        btns[i].classList.toggle('active', on);
        btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      var items = list.querySelectorAll('.faq-item');
      for (var j = 0; j < items.length; j++) {
        var vis = items[j].getAttribute('data-cat') === cat;
        items[j].style.display = vis ? '' : 'none';
        if (!vis) closeItem(items[j]);
      }
    }

    rail.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.faq-cat') : null;
      if (!b) return;
      showCat(b.getAttribute('data-cat'));
      list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    list.addEventListener('click', function (e) {
      var q = e.target.closest ? e.target.closest('.faq-q') : null;
      if (!q) return;
      var it = q.parentElement;
      var willOpen = !it.classList.contains('open');
      var opened = list.querySelectorAll('.faq-item.open');
      for (var i = 0; i < opened.length; i++) closeItem(opened[i]);
      if (willOpen) openItem(it);
    });

    // keep the open panel correctly sized on resize
    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var it = list.querySelector('.faq-item.open');
        if (!it) return;
        var a = it.querySelector('.faq-a');
        if (a) { a.style.maxHeight = 'none'; a.style.maxHeight = a.scrollHeight + 'px'; }
      }, 140);
    });

    // "Talk to our support team" -> open the Tawk widget if it is loaded
    var sup = document.getElementById('faq-support-link');
    if (sup) {
      sup.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.Tawk_API && typeof window.Tawk_API.maximize === 'function') {
          window.Tawk_API.maximize();
        }
      });
    }

    var first = rail.querySelector('.faq-cat');
    if (first) showCat(first.getAttribute('data-cat'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFAQ);
  } else {
    initFAQ();
  }
})();
/* ============================================================
   Support chat helper (used by the footer "Contact Us" link)
   ============================================================ */
function openSupportChat() {
  if (window.Tawk_API && typeof window.Tawk_API.maximize === 'function') {
    window.Tawk_API.maximize();
    return;
  }
  window.location.href = 'mailto:support@aalynex.com';
}
