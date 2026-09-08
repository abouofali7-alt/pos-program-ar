/* ============================================================
   AR-Program — بوابة طرق الدفع المتقدمة (Enterprise Payments Engine)
   دعم: Cash, Credit Card, Bank Transfer, Apple Pay, Installments
   ============================================================ */

const ARPayments = (function () {
    const METHODS = [
        { id: 'cash', label: 'نقداً (كاش)', icon: 'fa-solid fa-money-bill-wave', color: '#22c55e' },
        { id: 'card', label: 'بطاقة ائتمان / فيزا', icon: 'fa-solid fa-credit-card', color: '#38bdf8' },
        { id: 'bank', label: 'تحويل بنكي', icon: 'fa-solid fa-building-columns', color: '#a78bfa' },
        { id: 'apple', label: 'Apple Pay / محفظة', icon: 'fa-brands fa-apple', color: '#f8fafc' },
        { id: 'bnpl', label: 'آجل / تقسيط', icon: 'fa-solid fa-clock-rotate-left', color: '#f59e0b' }
    ];

    let _selectedMethod = 'cash';

    function openCheckoutModal(amount, onCompleteCallback) {
        let modal = document.getElementById('checkoutModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'checkoutModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
            document.body.appendChild(modal);
        }

        _selectedMethod = 'cash';
        window._checkoutCallback = onCompleteCallback;

        const formattedAmount = typeof ARCurrency !== 'undefined' ? ARCurrency.format(amount) : UI.money(amount);

        renderModalContent(modal, amount, formattedAmount);
        modal.style.display = 'flex';
    }

    function renderModalContent(modal, amount, formattedAmount) {
        modal.innerHTML = `
            <div style="background:var(--card-dark);border:1px solid var(--border-color);border-radius:14px;width:min(480px,92vw);padding:24px;box-shadow:var(--shadow-card);animation:fadeIn 0.2s;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid var(--border-color);padding-bottom:12px;">
                    <b style="font-size:1.1rem;color:var(--accent-cyan);"><i class="fa-solid fa-cash-register"></i> تحديد طريقة الدفع وتأكيد الفاتورة</b>
                    <button onclick="document.getElementById('checkoutModal').style.display='none'" class="icon-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div style="text-align:center;padding:14px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:18px;">
                    <div style="font-size:0.85rem;color:var(--text-secondary);">المبلغ الإجمالي المطلـوب</div>
                    <div style="font-size:1.8rem;font-weight:800;color:var(--success);margin-top:4px;">${formattedAmount}</div>
                </div>

                <div style="font-size:0.9rem;font-weight:700;margin-bottom:10px;color:var(--text-primary);">اختر طريقة الدفع:</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;" id="payMethodsGrid">
                    ${METHODS.map(m => {
                        const isSel = _selectedMethod === m.id;
                        return `
                            <button type="button" onclick="ARPayments.selectMethod('${m.id}')" 
                                style="padding:12px 14px;display:flex;align-items:center;gap:10px;justify-content:flex-start;font-size:0.88rem;border-radius:10px;cursor:pointer;transition:all 0.2s;background:${isSel ? 'rgba(56,189,248,0.18)' : 'var(--card-hover)'};border:2px solid ${isSel ? 'var(--accent-cyan)' : 'var(--border-color)'};color:var(--text-primary);">
                                <i class="${m.icon}" style="color:${m.color};font-size:1.2rem;"></i>
                                <span style="font-weight:${isSel ? '700' : '500'};">${m.label}</span>
                            </button>
                        `;
                    }).join('')}
                </div>

                <div id="paymentStatusBox" style="display:none;padding:12px;border-radius:8px;text-align:center;font-weight:600;font-size:0.9rem;margin-bottom:14px;"></div>

                <div style="display:flex;gap:10px;margin-top:10px;">
                    <button type="button" onclick="document.getElementById('checkoutModal').style.display='none'" class="btn btn-secondary" style="flex:1;padding:10px;">إلغاء</button>
                    <button type="button" id="confirmPayBtn" onclick="ARPayments.confirmPayment(${amount})" class="btn btn-primary-soft" style="flex:2;padding:10px;font-weight:700;">
                        <i class="fa-solid fa-circle-check"></i> تأكيد وإصدار الفاتورة
                    </button>
                </div>
            </div>
        `;
    }

    function selectMethod(methodId) {
        _selectedMethod = methodId;
        const modal = document.getElementById('checkoutModal');
        if (modal) {
            const btns = modal.querySelectorAll('#payMethodsGrid button');
            METHODS.forEach((m, idx) => {
                const btn = btns[idx];
                if (btn) {
                    const isSel = m.id === methodId;
                    btn.style.background = isSel ? 'rgba(56,189,248,0.18)' : 'var(--card-hover)';
                    btn.style.borderColor = isSel ? 'var(--accent-cyan)' : 'var(--border-color)';
                }
            });
        }
    }

    function confirmPayment(amount) {
        const confirmBtn = document.getElementById('confirmPayBtn');
        if (confirmBtn) confirmBtn.disabled = true;

        const box = document.getElementById('paymentStatusBox');
        if (box) {
            box.style.display = 'block';
            box.style.background = 'rgba(56,189,248,0.15)';
            box.style.color = '#38bdf8';
            box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تأكيد الدفع وإصدار الفاتورة...';
        }

        setTimeout(() => {
            if (box) {
                box.style.background = 'rgba(34,197,94,0.15)';
                box.style.color = '#22c55e';
                box.innerHTML = '<i class="fa-solid fa-circle-check"></i> تم الدفع وتأكيد الفاتورة بنجاح!';
            }
            setTimeout(() => {
                const modal = document.getElementById('checkoutModal');
                if (modal) modal.style.display = 'none';
                if (window._checkoutCallback) {
                    window._checkoutCallback({ method: _selectedMethod, amount, status: 'success' });
                }
            }, 300);
        }, 400);
    }

    window.processPayment = function(methodId, amount) {
        selectMethod(methodId);
        confirmPayment(amount);
    };

    return { METHODS, openCheckoutModal, selectMethod, confirmPayment, processPayment: window.processPayment };
})();
