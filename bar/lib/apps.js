// ONE Ticket — sistema do Bar. A Bilheteria é outro sistema, no mesmo banco.
export const APP = 'bar';
export const AREA = 'Bar';
export const OTHER = { label: 'Bilheteria', url: 'https://ingressos-demo.vercel.app' };

export const ROLE_LABEL = {
  produtor: 'Produtor', bilheteria: 'Bilheteria', portaria: 'Portaria', gerente_bar: 'Gerente do bar', caixa_bar: 'Caixa do bar',
};

// Quem entra em cada parte deste sistema
export const ACCESS = {
  pdv: ['produtor', 'gerente_bar', 'caixa_bar'],
  painel: ['produtor', 'gerente_bar'],
  cancelar: ['produtor', 'gerente_bar'], // cancelar venda já enviada ao servidor
  resultado: ['produtor'],
};

export const HOME = { produtor: '/painel', gerente_bar: '/painel', caixa_bar: '/pdv' };

export const NAV = [
  { href: '/painel', label: 'Painel do bar', roles: ACCESS.painel },
  { href: '/painel/cadastro', label: 'Produtos, estoque e line-up', roles: ACCESS.painel },
  { href: '/pdv', label: 'PDV', roles: ACCESS.pdv },
  { href: '/resultado', label: 'Resultado da festa', roles: ACCESS.resultado },
];
export const OTHER_ROLES = ['produtor'];

export const RESULT_LINKS = { tickets: `${OTHER.url}/painel`, bar: '/painel' };

export const LOGIN_TITLE = 'Entrar no bar';
