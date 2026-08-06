;(function () {
    var SECTIONS = [
        {
            id: 'operacoes',
            label: 'Operações',
            icon: 'fa-solid fa-clipboard-list',
            items: [
                { label: 'Ordens de Serviço', href: '/service_orders' },
                { label: 'Assinaturas', href: '/subscriptions' },
                { label: 'Protocolos', href: '/protocols' },
            ],
        },
        {
            id: 'clientes',
            label: 'Clientes',
            icon: 'fa-solid fa-users',
            items: [
                { label: 'Clientes', href: '/clients' },
                { label: 'Projetos', href: '/projects' },
                { label: 'Cobranças', href: '/billings' },
            ],
        },
        {
            id: 'financeiro',
            label: 'Financeiro',
            icon: 'fa-solid fa-landmark',
            items: [
                { label: 'Contas a Pagar', href: '/payables' },
                { label: 'Contas Bancárias', href: '/bank-accounts' },
                { label: 'Transferências', href: '/bank-transfers' },
                { label: 'Centros de Custo', href: '/cost-centers' },
            ],
        },
        {
            id: 'relatorios',
            label: 'Relatórios',
            icon: 'fa-solid fa-chart-line',
            items: [
                { label: 'Fluxo de Caixa', href: '/financial-history' },
                { label: 'DRE', href: '/dre-report' },
                { label: 'Despesas', href: '/expense-report' },
            ],
        },
        {
            id: 'config',
            label: 'Config',
            icon: 'fa-solid fa-gear',
            items: [
                { label: 'Produtos', href: '/products' },
                { label: 'Fornecedores', href: '/suppliers' },
                { label: 'Servidores', href: '/servers' },
                { label: 'Configurações', href: '/config' },
            ],
        },
    ]

    var path = window.location.pathname

    function sectionActive(s) {
        return s.items.some(function (i) { return path.startsWith(i.href) })
    }

    function itemActive(href) {
        return path.startsWith(href)
    }

    // ── Desktop nav ───────────────────────────────────────────────
    function buildDesktop() {
        var html = '<div class="cx-desktop-nav">'
        SECTIONS.forEach(function (s) {
            var active = sectionActive(s)
            html += '<div class="btn-group">'
            html += '<button type="button" class="btn btn-sm dropdown-toggle ' +
                (active ? 'btn-dark' : 'btn-outline-secondary') +
                '" data-bs-toggle="dropdown" aria-expanded="false">' +
                '<i class="' + s.icon + ' me-1"></i>' + s.label +
                '</button>'
            html += '<ul class="dropdown-menu">'
            s.items.forEach(function (item) {
                html += '<li><a class="dropdown-item' + (itemActive(item.href) ? ' active' : '') +
                    '" href="' + item.href + '">' + item.label + '</a></li>'
            })
            html += '</ul></div>'
        })
        html += '</div>'
        return html
    }

    // ── Mobile bottom nav + drawers ───────────────────────────────
    function buildMobile() {
        var TABS = [
            { label: 'Início', icon: 'fa-solid fa-house', href: '/dashboard', direct: true },
            { label: 'Operações', icon: 'fa-solid fa-clipboard-list', section: 'operacoes' },
            { label: 'Clientes', icon: 'fa-solid fa-users', section: 'clientes' },
            { label: 'Financeiro', icon: 'fa-solid fa-landmark', section: 'financeiro' },
            { label: 'Mais', icon: 'fa-solid fa-ellipsis', section: 'mais' },
        ]

        // Merge relatórios + config into "mais"
        var MAIS = { id: 'mais', label: 'Mais', items: [] }
        ;['relatorios', 'config'].forEach(function (id) {
            var s = SECTIONS.find(function (x) { return x.id === id })
            if (s) MAIS.items = MAIS.items.concat(s.items)
        })
        var allSections = SECTIONS.concat([MAIS])

        var bottomBar = '<nav class="cx-bottom-nav" id="cx-bottom-nav">'
        TABS.forEach(function (tab) {
            var active = tab.direct
                ? path === tab.href || path === '/dashboard.html'
                : (function () {
                      var s = allSections.find(function (x) { return x.id === tab.section })
                      return s ? s.items.some(function (i) { return path.startsWith(i.href) }) : false
                  })()
            if (tab.direct) {
                bottomBar += '<a href="' + tab.href + '" class="cx-bottom-nav__item' +
                    (active ? ' cx-bottom-nav__item--active' : '') + '">' +
                    '<i class="' + tab.icon + '"></i><span>' + tab.label + '</span></a>'
            } else {
                bottomBar += '<button type="button" class="cx-bottom-nav__item' +
                    (active ? ' cx-bottom-nav__item--active' : '') +
                    '" onclick="cxNavToggle(\'' + tab.section + '\')">' +
                    '<i class="' + tab.icon + '"></i><span>' + tab.label + '</span></button>'
            }
        })
        bottomBar += '</nav>'

        // Drawers
        var drawers = ''
        ;['operacoes', 'clientes', 'financeiro', 'mais'].forEach(function (id) {
            var s = allSections.find(function (x) { return x.id === id })
            if (!s) return
            drawers += '<div id="cx-drawer-' + id + '" class="cx-drawer" style="display:none">' +
                '<div class="cx-drawer__overlay" onclick="cxNavClose()"></div>' +
                '<div class="cx-drawer__panel">' +
                '<div class="cx-drawer__header">' +
                '<span>' + (s.label || id) + '</span>' +
                '<button class="cx-drawer__close" onclick="cxNavClose()">' +
                '<i class="fa-solid fa-xmark"></i></button></div>' +
                '<ul class="cx-drawer__list">'
            s.items.forEach(function (item) {
                drawers += '<li><a href="' + item.href + '" class="cx-drawer__link' +
                    (itemActive(item.href) ? ' cx-drawer__link--active' : '') + '">' +
                    item.label + '</a></li>'
            })
            drawers += '</ul></div></div>'
        })

        return bottomBar + drawers
    }

    // ── Inject ────────────────────────────────────────────────────
    function inject() {
        // Find and replace the existing nav block
        var oldNav = null
        var candidates = document.querySelectorAll('[data-bs-toggle="dropdown"]')
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].textContent.indexOf('Gestão') !== -1 ||
                candidates[i].textContent.indexOf('Operações') !== -1) {
                oldNav = candidates[i].closest('.col') || candidates[i].closest('.d-flex')
                if (oldNav && oldNav.parentNode) break
            }
        }

        var placeholder = document.createElement('div')
        placeholder.id = 'cx-nav-placeholder'

        if (oldNav) {
            oldNav.parentNode.replaceChild(placeholder, oldNav)
        } else {
            // Fallback: insert after navbar
            var navbar = document.querySelector('.navbar')
            if (navbar && navbar.nextSibling) {
                navbar.parentNode.insertBefore(placeholder, navbar.nextSibling)
            } else {
                document.body.prepend(placeholder)
            }
        }

        placeholder.innerHTML = buildDesktop()

        // Mobile: append to body
        var mobileWrap = document.createElement('div')
        mobileWrap.id = 'cx-mobile-nav-root'
        mobileWrap.innerHTML = buildMobile()
        document.body.appendChild(mobileWrap)
    }

    // ── Global helpers ────────────────────────────────────────────
    window.cxNavToggle = function (id) {
        ;['operacoes', 'clientes', 'financeiro', 'mais'].forEach(function (sid) {
            var el = document.getElementById('cx-drawer-' + sid)
            if (el) {
                if (sid === id) {
                    el.style.display = el.style.display === 'none' ? 'flex' : 'none'
                } else {
                    el.style.display = 'none'
                }
            }
        })
    }

    window.cxNavClose = function () {
        ;['operacoes', 'clientes', 'financeiro', 'mais'].forEach(function (id) {
            var el = document.getElementById('cx-drawer-' + id)
            if (el) el.style.display = 'none'
        })
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject)
    } else {
        inject()
    }
})()
