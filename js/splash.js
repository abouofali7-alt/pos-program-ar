/* ============================================================
   AR-Program — Cinematic Machinery Splash Animation Controller
   المسار الزمني:
   1. 0s - 2.6s : الشخص يمسح الأتربة عن التروس (Back view technician)
   2. 2.6s      : تنظيف التروس والتماعها، وبدء دوران التروس التفاعلية
   3. 3.2s      : انطلاق الطاقة من التروس وتفعيل المحرك والكباسات
   4. 4.0s      : تدفق الطاقة نحو لوحة الاسم وإضاءة الحروف حرفاً بحرف
   5. 6.0s      : ظهور الرسالة الترحيبية واكتمال شريط التحويل
   6. 8.0s      : التوجيه التلقائي لصفحة الدخول أو لوحة التحكم
   ============================================================ */

const ARSplash = (function () {
    let _redirectTimer = null;
    let _hasFinished = false;

    function initSplash() {
        const overlay = document.getElementById('splashOverlay');
        if (!overlay) return;

        startAnimationSequence();
    }

    function startAnimationSequence() {
        const dustLayer = document.getElementById('dustLayer');
        const armGroup = document.getElementById('rightArmWipingGroup');
        const gear1 = document.getElementById('gear1');
        const gear2 = document.getElementById('gear2');
        const gear3 = document.getElementById('gear3');
        const piston1 = document.getElementById('piston1');
        const piston2 = document.getElementById('piston2');
        const pulseLeft = document.getElementById('energyPulseLeft');
        const pulseRight = document.getElementById('energyPulseRight');

        // المرحلة 1: مسح الأتربة (0s - 2.6s)
        if (armGroup) armGroup.classList.add('wiping-arm');
        if (dustLayer) dustLayer.classList.add('dust-layer-anim');

        // المرحلة 2: دوران التروس والتماعها (2.6s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (gear1) gear1.classList.add('gear-spin-cw');
            if (gear2) gear2.classList.add('gear-spin-ccw');
            if (gear3) gear3.classList.add('gear-spin-cw');

            const sparkles = document.getElementById('sparkleGroup');
            if (sparkles) sparkles.classList.add('sparkle-anim');
        }, 2600);

        // المرحلة 3: تشغيل المحرك والكباسات (3.2s)
        setTimeout(() => {
            if (_hasFinished) return;
            const engineGroup = document.getElementById('engineGroup');
            if (engineGroup) engineGroup.classList.add('engine-active');
            if (piston1) piston1.classList.add('piston-1-anim');
            if (piston2) piston2.classList.add('piston-2-anim');

            if (pulseLeft) pulseLeft.classList.add('energy-line-anim');
            if (pulseRight) pulseRight.classList.add('energy-line-anim');
        }, 3200);

        // المرحلة 4: إضاءة حروف الاسم حرفاً بحرف (4.0s)
        setTimeout(() => {
            if (_hasFinished) return;
            illuminateTitleLetters();
        }, 4000);
    }

    function illuminateTitleLetters() {
        const chars = document.querySelectorAll('.splash-char');
        if (!chars.length) return;

        let index = 0;
        const interval = setInterval(() => {
            if (_hasFinished) {
                clearInterval(interval);
                return;
            }
            if (index < chars.length) {
                chars[index].classList.add('lit');
                index++;
            } else {
                clearInterval(interval);
                // المرحلة 5: إظهار الرسالة الترحيبية والتوجيه
                setTimeout(showWelcomeAndRedirect, 350);
            }
        }, 150);
    }

    function showWelcomeAndRedirect() {
        if (_hasFinished) return;

        const welcomeModal = document.getElementById('welcomeModal');
        const fillBar = document.getElementById('splashProgressFill');

        if (welcomeModal) welcomeModal.classList.add('show');
        if (fillBar) fillBar.style.width = '100%';

        _redirectTimer = setTimeout(() => {
            finishAndRedirect();
        }, 2400);
    }

    function finishAndRedirect() {
        if (_hasFinished) return;
        _hasFinished = true;

        if (_redirectTimer) clearTimeout(_redirectTimer);

        const overlay = document.getElementById('splashOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
        }

        setTimeout(() => {
            try {
                const sessionStr = localStorage.getItem('ar_session');
                if (!sessionStr) {
                    window.location.href = 'pages/login.html';
                } else {
                    const u = JSON.parse(sessionStr);
                    const isMgr = u && (u.roleId === 1 || u.roleName === 'مدير' || (u.username && u.username.toLowerCase() === 'admin'));
                    if (!isMgr) {
                        window.location.href = 'pages/business/pos.html';
                    } else {
                        if (overlay) overlay.style.display = 'none';
                        if (typeof initDashboard === 'function') initDashboard();
                    }
                }
            } catch (e) {
                window.location.href = 'pages/login.html';
            }
        }, 600);
    }

    return { initSplash, finishAndRedirect };
})();

document.addEventListener('DOMContentLoaded', () => {
    ARSplash.initSplash();
});
