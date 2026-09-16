(function (root) {
    'use strict';

    function safeText(value) {
        return String(value ?? '').replace(/[&<>"']/g, char =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function renderAsyncState(container, {
        kind = 'loading', message = '加载中…', retryLabel = '重试', onRetry
    } = {}) {
        if (!container) return;
        const documentRef = container.ownerDocument || root.document;
        container.replaceChildren();
        const state = documentRef.createElement('div');
        state.className = `async-state async-state-${kind}`;
        state.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        state.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
        const text = documentRef.createElement('p');
        text.textContent = message;
        state.appendChild(text);
        if (kind === 'error' && typeof onRetry === 'function') {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'async-retry-btn';
            button.textContent = retryLabel;
            button.addEventListener('click', onRetry, { once: true });
            state.appendChild(button);
        }
        container.appendChild(state);
    }

    function rentalTimelineSteps(order = {}) {
        const steps = [{ key: 'created', label: '订单已创建', state: 'done' }];
        const payment = order.payment_status || 'unpaid';
        if (payment === 'paid') {
            steps.push({ key: 'payment', label: '付款已人工核实', state: 'done' });
        } else if (payment === 'submitted') {
            steps.push({ key: 'payment', label: '付款凭证待人工核实', state: 'current' });
        } else if (payment === 'rejected') {
            steps.push({ key: 'payment', label: '付款凭证未通过，待重新提交', state: 'warning' });
        } else {
            steps.push({ key: 'payment', label: Number(order.total_price) > 0 ? '等待付款凭证' : '等待免现金审核', state: 'current' });
        }

        if (order.status === 'cancelled') {
            steps.push({ key: 'cancelled', label: order.refund_reference ? '退款已核实，订单已取消' : '订单已取消', state: 'warning' });
            return steps;
        }
        if (order.disputed_at) {
            steps.push({ key: 'dispute', label: order.resolved_at ? '争议已处理' : '争议处理中', state: order.resolved_at ? 'done' : 'warning' });
        }
        if (order.status === 'active' || order.status === 'completed') {
            steps.push({ key: 'rental', label: '租用进行中', state: order.status === 'completed' ? 'done' : 'current' });
        } else if (payment === 'paid') {
            steps.push({ key: 'rental', label: '等待出租方确认开始', state: 'current' });
        }
        if (order.owner_complete_requested_at && order.status !== 'completed') {
            steps.push({ key: 'completion', label: '出租方已申请完成，等待租用方确认', state: 'current' });
        }
        if (order.status === 'completed') {
            steps.push({ key: 'completed', label: '订单已完成并结算', state: 'done' });
        }
        return steps;
    }

    function rentalTimelineHtml(order) {
        const items = rentalTimelineSteps(order).map(step =>
            `<li class="timeline-step timeline-${safeText(step.state)}"><span>${safeText(step.label)}</span></li>`
        ).join('');
        return `<ol class="order-timeline" aria-label="订单处理进度">${items}</ol>`;
    }

    function enhanceModals(documentRef = root.document) {
        if (!documentRef?.querySelectorAll) return () => {};
        const observers = [];
        documentRef.querySelectorAll('.modal-overlay').forEach(modal => {
            const card = modal.querySelector('.modal-card');
            const closeButton = modal.querySelector('.modal-close');
            const title = modal.querySelector('h1, h2, h3');
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-hidden', modal.style.display === 'none' ? 'true' : 'false');
            if (title && modal.id) {
                if (!title.id) title.id = `${modal.id}Title`;
                modal.setAttribute('aria-labelledby', title.id);
            }
            if (card && !card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
            if (closeButton) {
                closeButton.type = 'button';
                if (!closeButton.getAttribute('aria-label')) closeButton.setAttribute('aria-label', '关闭弹窗');
            }
            let returnFocus = null;
            const sync = () => {
                const visible = modal.style.display !== 'none';
                modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
                if (visible) {
                    returnFocus = documentRef.activeElement;
                    const target = modal.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex="0"]') || card;
                    root.requestAnimationFrame?.(() => target?.focus?.());
                } else if (returnFocus?.isConnected) {
                    returnFocus.focus?.();
                    returnFocus = null;
                }
            };
            const Observer = root.MutationObserver;
            if (Observer) {
                const observer = new Observer(sync);
                observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
                observers.push(observer);
            }
            modal.addEventListener('keydown', event => {
                if (modal.style.display === 'none') return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    if (closeButton) closeButton.click();
                    else modal.style.display = 'none';
                    return;
                }
                if (event.key === 'Tab') {
                    const focusable = Array.from(modal.querySelectorAll(
                        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
                    )).filter(element => element.getClientRects?.().length !== 0);
                    if (!focusable.length) { event.preventDefault(); card?.focus?.(); return; }
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && documentRef.activeElement === first) {
                        event.preventDefault(); last.focus();
                    } else if (!event.shiftKey && documentRef.activeElement === last) {
                        event.preventDefault(); first.focus();
                    }
                }
            });
        });
        return () => observers.forEach(observer => observer.disconnect());
    }

    root.UIRuntime = { enhanceModals, renderAsyncState, rentalTimelineHtml, rentalTimelineSteps, safeText };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.UIRuntime;
})(typeof window !== 'undefined' ? window : globalThis);
