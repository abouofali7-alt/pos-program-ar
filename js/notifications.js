/* ============================================================
   AR-Program — مركز الإشعارات والتنبيهات الذكي (Smart Notifications)
   فحص المخزون المنخفض، الفواتير المتأخرة، والمهام، ورواتب وسلف الموظفين وميعاد تصفية الرواتب
   ============================================================ */

const ARNotifications = (function () {
    let _notifications = [];

    async function loadNotifications() {
        _notifications = [];
        try {
            const [products, movements, invoices, tasks, employees, payroll, advances] = await Promise.all([
                ARDB.getAll('products').catch(() => []),
                ARDB.getAll('stockMovements').catch(() => []),
                ARDB.getAll('invoices').catch(() => []),
                ARDB.getAll('tasks').catch(() => []),
                ARDB.getAll('employees').catch(() => []),
                ARDB.getAll('payroll').catch(() => []),
                ARDB.getAll('advances').catch(() => [])
            ]);

            // 1. تنبيهات المخزون المنخفض
            const qtyMap = {};
            (movements || []).forEach(m => {
                if (qtyMap[m.productId] === undefined) qtyMap[m.productId] = 0;
                qtyMap[m.productId] += (m.quantity || 0) * (m.direction === 'in' ? 1 : -1);
            });

            (products || []).forEach(p => {
                const currentQty = qtyMap[p.id] || 0;
                const min = p.minStock || 5;
                if (currentQty <= min) {
                    _notifications.push({
                        id: 'p_' + p.id,
                        type: 'warning',
                        icon: 'fa-boxes-stacked',
                        title: 'تنبيه مخزون منخفض',
                        msg: `المنتج (${p.name}) شارف على النفاد (المتبقي: ${currentQty})`,
                        href: 'inventory/inventory.html'
                    });
                }
            });

            // 2. تنبيهات المهام المعلقة
            (tasks || []).forEach(t => {
                if (t.status === 'pending' || t.status === 'in_progress') {
                    _notifications.push({
                        id: 't_' + t.id,
                        type: 'info',
                        icon: 'fa-list-check',
                        title: 'مهمة قيد الانتظار',
                        msg: `المهمة: (${t.title || t.name}) قيد التنفيذ`,
                        href: 'business/tasks.html'
                    });
                }
            });

            // 3. تنبيهات متابعة الرواتب وميعاد التصفية
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
            const currentPeriod = `${currentYear}-${currentMonth}`;
            const dayOfMonth = now.getDate();

            const activeEmployees = (employees || []).filter(e => e.status !== 'inactive');
            const totalEmps = activeEmployees.length;

            if (totalEmps > 0) {
                const monthPayrolls = (payroll || []).filter(p => p.period === currentPeriod);
                const paidPayrolls = monthPayrolls.filter(p => p.status === 'paid' || p.paid);
                const unpaidEmpCount = Math.max(0, totalEmps - paidPayrolls.length);

                // أ. تنبيه اقتراب/حلول ميعاد تصفية الرواتب (بدءاً من يوم 25 في الشهر)
                if (dayOfMonth >= 25 && unpaidEmpCount > 0) {
                    _notifications.push({
                        id: 'pay_settle_due_' + currentPeriod,
                        type: 'warning',
                        icon: 'fa-calendar-check',
                        title: 'موعد تصفية الرواتب الشهرية',
                        msg: `اقتربت نهاية شهر (${currentPeriod})، حان موعد تصفية الرواتب. متبقي ${unpaidEmpCount} موظف لم يتم تسديد رواتبهم بعد`,
                        href: 'hr/payroll.html'
                    });
                }

                // ب. تنبيه مسيرات الرواتب المعلقة وغير الصادرة
                const totalUnpaidNet = monthPayrolls.reduce((sum, p) => {
                    if (p.status !== 'paid' && !p.paid) {
                        return sum + Number(p.netSalary || p.net || 0);
                    }
                    return sum;
                }, 0);

                if (totalUnpaidNet > 0) {
                    _notifications.push({
                        id: 'pay_pending_' + currentPeriod,
                        type: 'info',
                        icon: 'fa-money-bill-wave',
                        title: 'مسير رواتب قيد الصرف والتصفية',
                        msg: `رواتب شهر (${currentPeriod}): يوجد مبالغ رواتب مستحقة الصرف بقيمة إجمالية ${totalUnpaidNet.toFixed(2)} ج.م`,
                        href: 'hr/payroll.html'
                    });
                }
            }

            // 4. تنبيهات متابعة سُلف الموظفين القائمة والأقساط المستحقة
            const activeAdvances = (advances || []).filter(a => {
                const amt = Number(a.amount || 0);
                const pd = Number(a.paidAmount || 0);
                return (amt - pd) > 0.01;
            });

            if (activeAdvances.length > 0) {
                const empMap = {};
                (employees || []).forEach(e => empMap[String(e.id)] = e.name);

                let totalRemaining = 0;
                activeAdvances.forEach(a => {
                    totalRemaining += (Number(a.amount || 0) - Number(a.paidAmount || 0));
                });

                // تنبيه عام لملخص السلف النشطة الذمة
                _notifications.push({
                    id: 'adv_active_summary',
                    type: 'warning',
                    icon: 'fa-hand-holding-dollar',
                    title: 'سُلف وقروض قائمة للموظفين',
                    msg: `يوجد عدد ${activeAdvances.length} سُلفة قائمة بمبلغ متبقي إجمالي ${totalRemaining.toFixed(2)} ج.م يتطلب الخصم والمتابعة`,
                    href: 'hr/advances.html'
                });

                // تنبيهات تفصيلية للأقساط الشهريّة المستحقة
                activeAdvances.forEach(a => {
                    const rem = Number(a.amount || 0) - Number(a.paidAmount || 0);
                    const inst = Number(a.installment || 0);
                    const empName = empMap[String(a.employeeId)] || 'موظف';

                    if (inst > 0) {
                        const currentDeduct = Math.min(inst, rem);
                        _notifications.push({
                            id: 'adv_inst_' + a.id,
                            type: 'info',
                            icon: 'fa-file-signature',
                            title: `قسط سُلفة مستحق — ${empName}`,
                            msg: `مستحق خصم قسط شهري بقيمة ${currentDeduct.toFixed(2)} ج.م من راتب الموظف (المتبقي الكلي: ${rem.toFixed(2)} ج.م)`,
                            href: 'hr/advances.html'
                        });
                    }
                });
            }

        } catch (e) {
            console.warn('[Notifications] Error loading alerts:', e);
        }

        updateNotificationUI();
        return _notifications;
    }

    function updateNotificationUI() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        const count = _notifications.length;
        if (count > 0) {
            badge.style.display = 'inline-flex';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    }

    async function toggleNotificationPanel() {
        let panel = document.getElementById('notifPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'notifPanel';
            panel.style.cssText = 'position:fixed;top:60px;left:20px;width:340px;max-height:450px;background:var(--card-dark);border:1px solid var(--border-color);border-radius:14px;box-shadow:var(--shadow-card);z-index:99999;display:flex;flex-direction:column;overflow:hidden;animation:fadeIn 0.2s;';
            document.body.appendChild(panel);
        }

        if (panel.style.display === 'flex') {
            panel.style.display = 'none';
            return;
        }

        // تحديث الإشعارات فوراً عند الفتح
        await loadNotifications();

        const prefix = (typeof ARUI !== 'undefined') ? ARUI.assetUrl('') : '';
        let listHtml = '';
        if (!_notifications.length) {
            listHtml = '<div style="padding:30px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-bell-slash" style="font-size:2rem;margin-bottom:8px;opacity:0.5;"></i><div>لا توجد تنبيهات جديدة</div></div>';
        } else {
            listHtml = _notifications.map(n => `
                <a href="${prefix + 'pages/' + n.href}" style="display:flex;gap:12px;padding:12px;border-bottom:1px solid var(--border-color);text-decoration:none;color:var(--text-primary);transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                    <div style="font-size:1.2rem;color:${n.type === 'warning' ? '#f59e0b' : '#38bdf8'};"><i class="fa-solid ${n.icon}"></i></div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.85rem;margin-bottom:2px;">${n.title}</div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">${n.msg}</div>
                    </div>
                </a>
            `).join('');
        }

        panel.innerHTML = `
            <div style="padding:14px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
                <b style="font-size:0.95rem;"><i class="fa-solid fa-bell" style="color:var(--accent-cyan);"></i> مركز الإشعارات (${_notifications.length})</b>
                <button onclick="document.getElementById('notifPanel').style.display='none'" class="icon-btn" style="width:26px;height:26px;font-size:0.8rem;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div style="overflow-y:auto;flex:1;">${listHtml}</div>
        `;

        panel.style.display = 'flex';
    }

    return { loadNotifications, toggleNotificationPanel };
})();
