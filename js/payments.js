/* ============================================================
   AR-Program — بوابة طرق الدفع المتقدمة والدفع المتعدد (Enterprise Payments Engine)
   دعم: Cash, Credit Card, Bank Transfer, Apple Pay, Installments, Split Payments
   ============================================================ */

const ARPayments = (function () {
    const METHODS = [
        { id: 'cash', label: 'نقداً (كاش)', icon: 'fa-solid fa-money-bill-wave', color: '#22c55e' },
        { id: 'card', label: 'بطاقة ائتمان / فيزا', icon: 'fa-solid fa-credit-card', color: '#38bdf8' },
        { id: 'bank', label: 'تحويل بنكي', icon: 'fa-solid fa-building-columns', color: '#a78bfa' },
        { id: 'apple', label: 'Apple Pay / محفظة', icon: 'fa-brands fa-apple', color: '#f8fafc' },
        { id: 'bnpl', label: 'آجل / تقسيط', icon: 'fa-solid fa-clock-rotate-left', color: '#f59e0b' }
    ];

    let _selectedMode = 'single'; // 'single' or 'split'
    let _selectedMethod = 'cash';
    let _splitAmounts = {};
    let _totalAmount = 0;

    function openCheckoutModal(amount, onCompleteCallback) {
        let modal = document.getElementById('checkoutModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'checkoutModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
            document.body.appendChild(modal);
        }

        _totalAmount = Number(amount) || 0;
        _selectedMode = 'single';
        _selectedMethod = 'cash';
        _splitAmounts = { cash: _totalAmount, card: 0, bank: 0, apple: 0, bnpl: 0 };
        window._checkoutCallback = onCompleteCallback;

        renderModalContent(modal);
        modal.style.display = 'flex';
    }

    function renderModalContent(modal) {
        const formattedAmount = typeof ARCurrency !== 'undefined' ? ARCurrency.format(_totalAmount) : UI.money(_totalAmount);

        modal.innerHTML = `
            <div style="background:var(--card-dark);border:1px solid var(--border-color);border-radius:14px;width:min(520px,94vw);padding:22px;box-shadow:var(--shadow-card);animation:fadeIn 0.2s;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid var(--border-color);padding-bottom:10px;">
                    <b style="font-size:1.1rem;color:var(--accent-cyan);"><i class="fa-solid fa-cash-register"></i> خيارات وتأكيد طريقة الدفع</b>
                    <button onclick="document.getElementById('checkoutModal').style.display='none'" class="icon-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:16px;">
                    <div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);">المبلغ المطلوب سداده</div>
                        <div style="font-size:1.6rem;font-weight:800;color:var(--success);margin-top:2px;">${formattedAmount}</div>
                    </div>
                    <div style="display:flex;gap:6px;background:var(--card-hover);padding:4px;border-radius:8px;">
                        <button type="button" class="btn btn-sm ${!_selectedMode || _selectedMode === 'single' ? 'btn-primary-soft' : 'btn-secondary'}" onclick="ARPayments.setMode('single')" style="font-size:0.8rem;">دفع عادي</button>
                        <button type="button" class="btn btn-sm ${_selectedMode === 'split' ? 'btn-primary-soft' : 'btn-secondary'}" onclick="ARPayments.setMode('split')" style="font-size:0.8rem;"><i class="fa-solid fa-layer-group"></i> دفع متعدد (تقسيم)</button>
                    </div>
                </div>

                <div id="singlePayView" style="display:${_selectedMode === 'single' ? 'block' : 'none'};">
                    <div style="font-size:0.88rem;font-weight:700;margin-bottom:10px;color:var(--text-primary);">اختر طريقة الدفع الرئيسية:</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;" id="payMethodsGrid">
                        ${METHODS.map(m => {
                            const isSel = _selectedMethod === m.id;
                            return `
                                <button type="button" onclick="ARPayments.selectMethod('${m.id}')" 
                                    style="padding:10px 12px;display:flex;align-items:center;gap:10px;justify-content:flex-start;font-size:0.85rem;border-radius:10px;cursor:pointer;transition:all 0.2s;background:${isSel ? 'rgba(56,189,248,0.18)' : 'var(--card-hover)'};border:2px solid ${isSel ? 'var(--accent-cyan)' : 'var(--border-color)'};color:var(--text-primary);">
                                    <i class="${m.icon}" style="color:${m.color};font-size:1.1rem;"></i>
                                    <span style="font-weight:${isSel ? '700' : '500'};">${m.label}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div id="splitPayView" style="display:${_selectedMode === 'split' ? 'block' : 'none'};">
                    <div style="font-size:0.85rem;font-weight:700;margin-bottom:10px;color:var(--text-primary);">حدد المبالغ المدفوعة بكل طريقة:</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;max-height:220px;overflow-y:auto;padding-left:4px;">
                        ${METHODS.map(m => `
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--card-hover);padding:8px 12px;border-radius:8px;">
                                <div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;">
                                    <i class="${m.icon}" style="color:${m.color};"></i>
                                    <span>${m.label}</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input type="number" id="split_in_${m.id}" step="0.01" min="0" 
                                        value="${_splitAmounts[m.id] || 0}" 
                                        oninput="ARPayments.updateSplitAmount('${m.id}', this.value)" 
                                        style="width:110px;padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--card-dark);color:var(--text-primary);font-weight:700;text-align:center;">
                                    <button type="button" class="btn btn-secondary" onclick="ARPayments.fillRemaining('${m.id}')" style="padding:4px 8px;font-size:0.75rem;" title="تخصيص المتبقي هنا">الباقي</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display:flex;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;font-size:0.88rem;margin-bottom:14px;">
                        <span>إجمالي المدفوعات: <b id="splitTotalPaid">0.00</b></span>
                        <span id="splitStatusText">المتبقي: <b id="splitDiff" style="color:var(--danger)">0.00</b></span>
                    </div>
                </div>

                <div id="paymentStatusBox" style="display:none;padding:10px;border-radius:8px;text-align:center;font-weight:600;font-size:0.85rem;margin-bottom:12px;"></div>

                <div style="display:flex;gap:10px;margin-top:10px;">
                    <button type="button" onclick="document.getElementById('checkoutModal').style.display='none'" class="btn btn-secondary" style="flex:1;padding:10px;">إلغاء</button>
                    <button type="button" id="confirmPayBtn" onclick="ARPayments.confirmPayment()" class="btn btn-primary-soft" style="flex:2;padding:10px;font-weight:700;">
                        <i class="fa-solid fa-circle-check"></i> تأكيد وإصدار الفاتورة
                    </button>
                </div>
            </div>
        `;
        recalcSplitUI();
    }

    function setMode(mode) {
        _selectedMode = mode;
        const modal = document.getElementById('checkoutModal');
        if (modal) renderModalContent(modal);
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

    function updateSplitAmount(methodId, val) {
        _splitAmounts[methodId] = Math.max(0, Number(val) || 0);
        recalcSplitUI();
    }

    function fillRemaining(methodId) {
        let otherPaid = 0;
        METHODS.forEach(m => {
            if (m.id !== methodId) otherPaid += (_splitAmounts[m.id] || 0);
        });
        const rem = Math.max(0, _totalAmount - otherPaid);
        _splitAmounts[methodId] = rem;
        const inp = document.getElementById(`split_in_${methodId}`);
        if (inp) inp.value = rem;
        recalcSplitUI();
    }

    function recalcSplitUI() {
        if (_selectedMode !== 'split') return;
        let sum = 0;
        METHODS.forEach(m => {
            sum += (_splitAmounts[m.id] || 0);
        });
        const diff = _totalAmount - sum;

        const totalPaidEl = document.getElementById('splitTotalPaid');
        const statusTextEl = document.getElementById('splitStatusText');

        if (totalPaidEl) totalPaidEl.innerHTML = UI.money(sum);
        if (statusTextEl) {
            if (Math.abs(diff) < 0.01) {
                statusTextEl.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-circle-check"></i> المبلغ مكتمل بالكامل</span>';
            } else if (diff > 0) {
                statusTextEl.innerHTML = `المتبقي: <b id="splitDiff" style="color:var(--danger)">${UI.money(diff)}</b>`;
            } else {
                statusTextEl.innerHTML = `الباقي للعميل (فائض): <b id="splitDiff" style="color:var(--accent-cyan)">${UI.money(Math.abs(diff))}</b>`;
            }
        }
    }

    function confirmPayment() {
        let paymentsList = [];
        let totalPaid = 0;

        if (_selectedMode === 'split') {
            METHODS.forEach(m => {
                const amt = _splitAmounts[m.id] || 0;
                if (amt > 0) {
                    paymentsList.push({ method: m.id, amount: amt, label: m.label });
                    totalPaid += amt;
                }
            });

            if (!paymentsList.length) {
                return UI.toast('يرجى تحديد المبلغ في طريقة دفع واحدة على الأقل!', 'warn');
            }
        } else {
            paymentsList.push({ method: _selectedMethod, amount: _totalAmount, label: (METHODS.find(m => m.id === _selectedMethod) || {}).label });
            totalPaid = _totalAmount;
        }

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
                    const primaryMethod = paymentsList.length === 1 ? paymentsList[0].method : 'split';
                    window._checkoutCallback({
                        status: 'success',
                        method: primaryMethod,
                        payments: paymentsList,
                        paidTotal: totalPaid,
                        amount: _totalAmount,
                        isSplit: paymentsList.length > 1
                    });
                }
            }, 300);
        }, 400);
    }

    window.processPayment = function(methodId, amount) {
        selectMethod(methodId);
        confirmPayment();
    };

    return { METHODS, openCheckoutModal, setMode, selectMethod, updateSplitAmount, fillRemaining, confirmPayment, processPayment: window.processPayment };
})();
