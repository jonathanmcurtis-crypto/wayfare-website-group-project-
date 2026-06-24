const STORAGE_KEY = 'wayfare.trip.v1';
const $ = (id) => document.getElementById(id);

const sampleTrip = {
  name: 'Barcelona Long Weekend',
  destination: 'Barcelona, Spain',
  start: '2026-08-14',
  end: '2026-08-17',
  members: ['Ava', 'Mateo', 'Priya', 'Jordan'],
  proposals: [
    { id: crypto.randomUUID(), title: 'Sagrada Família morning tour', note: 'Book early entry and grab pastries nearby after.', votes: ['Ava', 'Priya', 'Jordan'] },
    { id: crypto.randomUUID(), title: 'Tapas crawl in El Born', note: 'Keep it flexible and share plates across a few stops.', votes: ['Ava', 'Mateo', 'Priya', 'Jordan'] },
    { id: crypto.randomUUID(), title: 'Beach afternoon at Barceloneta', note: 'Low-cost reset day with swims and snacks.', votes: ['Mateo', 'Jordan'] }
  ],
  itinerary: [],
  expenses: []
};
sampleTrip.itinerary = [
  { id: crypto.randomUUID(), proposalId: sampleTrip.proposals[0].id, date: '2026-08-15', time: '09:30' },
  { id: crypto.randomUUID(), proposalId: sampleTrip.proposals[1].id, date: '2026-08-15', time: '19:00' }
];
sampleTrip.expenses = [
  { id: crypto.randomUUID(), title: 'Apartment deposit', payer: 'Ava', amount: 480, split: ['Ava', 'Mateo', 'Priya', 'Jordan'] },
  { id: crypto.randomUUID(), title: 'Museum tickets', payer: 'Priya', amount: 96, split: ['Ava', 'Priya', 'Jordan'] }
];

let state = loadState();
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTrip));
  return structuredClone(sampleTrip);
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function money(n) { return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }
function dateLabel(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
function tripDays() {
  if (!state.start || !state.end) return [];
  const days = [];
  for (let d = new Date(`${state.start}T12:00:00`), end = new Date(`${state.end}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}
function empty(text) { return `<div class="empty">${text}</div>`; }

function render() {
  $('trip-title').textContent = state.name || 'No trip yet';
  $('trip-meta').textContent = state.name ? `${state.destination} • ${dateLabel(state.start)} – ${dateLabel(state.end)}` : 'Create a trip to get started.';
  $('member-chips').innerHTML = state.members?.length ? state.members.map((m) => `<span class="chip">${m}</span>`).join('') : '<span class="empty">No members yet.</span>';
  $('trip-name').value = state.name || ''; $('trip-destination').value = state.destination || ''; $('trip-start').value = state.start || ''; $('trip-end').value = state.end || ''; $('trip-members').value = (state.members || []).join(', ');
  renderProposals(); renderScheduleForm(); renderTimeline(); renderExpenses();
}

function renderProposals() {
  $('proposal-count').textContent = `${state.proposals.length} total`;
  $('proposal-list').innerHTML = state.proposals.length ? state.proposals.map((p) => `
    <article class="item-card">
      <div class="item-top"><div><h3>${p.title}</h3><p>${p.note || 'No note added.'}</p></div><div class="vote">${p.votes.length}<br><small>votes</small></div></div>
      <div class="actions">${state.members.map((m) => `<button class="small-btn" data-vote="${p.id}" data-member="${m}">${p.votes.includes(m) ? '✓' : '+'} ${m}</button>`).join('')}<button class="small-btn danger" data-delete-proposal="${p.id}">Remove</button></div>
    </article>`).join('') : empty('No proposals yet. Add the first idea for your group.');
}
function renderScheduleForm() {
  $('schedule-proposal').innerHTML = state.proposals.length ? state.proposals.map((p) => `<option value="${p.id}">${p.title}</option>`).join('') : '<option value="">Add a proposal first</option>';
  const days = tripDays();
  $('schedule-date').min = days[0] || ''; $('schedule-date').max = days.at(-1) || ''; if (!$('schedule-date').value && days[0]) $('schedule-date').value = days[0];
}
function renderTimeline() {
  const days = tripDays();
  if (!days.length) { $('timeline').innerHTML = empty('Save trip dates to build a day-by-day itinerary.'); return; }
  $('timeline').innerHTML = days.map((day) => {
    const entries = state.itinerary.filter((i) => i.date === day).sort((a,b) => (a.time || '').localeCompare(b.time || ''));
    return `<section class="day"><h3>${dateLabel(day)}</h3>${entries.length ? entries.map((i) => { const p = state.proposals.find((x) => x.id === i.proposalId); return `<div class="timeline-entry"><span><strong>${i.time || 'Anytime'}</strong> — ${p?.title || 'Removed proposal'}</span><button class="small-btn danger" data-delete-itinerary="${i.id}">Remove</button></div>`; }).join('') : empty('Nothing scheduled yet.')}</section>`;
  }).join('');
}
function renderExpenses() {
  $('expense-payer').innerHTML = state.members.map((m) => `<option>${m}</option>`).join('');
  $('split-members').innerHTML = state.members.map((m) => `<label><input type="checkbox" value="${m}" checked> ${m}</label>`).join('');
  $('expense-count').textContent = `${state.expenses.length} total`;
  $('expense-list').innerHTML = state.expenses.length ? state.expenses.map((e) => `<article class="item-card"><div class="item-top"><div><h3>${e.title}</h3><p>${e.payer} paid ${money(e.amount)} split among ${e.split.join(', ')}</p></div><button class="small-btn danger" data-delete-expense="${e.id}">Remove</button></div></article>`).join('') : empty('No expenses yet. Add shared costs as they happen.');
  $('settlement-list').innerHTML = settlements();
}
function settlements() {
  if (!state.expenses.length || !state.members.length) return empty('No balances to settle yet.');
  const balances = Object.fromEntries(state.members.map((m) => [m, 0]));
  state.expenses.forEach((e) => { balances[e.payer] += Number(e.amount); const share = Number(e.amount) / e.split.length; e.split.forEach((m) => balances[m] -= share); });
  const debtors = [], creditors = [];
  Object.entries(balances).forEach(([name, amount]) => amount < -0.005 ? debtors.push({ name, amount: -amount }) : amount > 0.005 && creditors.push({ name, amount }));
  const payments = [];
  debtors.sort((a,b) => b.amount - a.amount); creditors.sort((a,b) => b.amount - a.amount);
  while (debtors.length && creditors.length) { const d = debtors[0], c = creditors[0], amount = Math.min(d.amount, c.amount); payments.push(`${d.name} pays ${c.name} ${money(amount)}`); d.amount -= amount; c.amount -= amount; if (d.amount < .01) debtors.shift(); if (c.amount < .01) creditors.shift(); }
  return payments.length ? `<ul>${payments.map((p) => `<li>${p}</li>`).join('')}</ul>` : empty('Everyone is settled up.');
}

$('trip-form').addEventListener('submit', (e) => { e.preventDefault(); state.name = $('trip-name').value.trim(); state.destination = $('trip-destination').value.trim(); state.start = $('trip-start').value; state.end = $('trip-end').value; state.members = $('trip-members').value.split(',').map((m) => m.trim()).filter(Boolean); save(); });
$('proposal-form').addEventListener('submit', (e) => { e.preventDefault(); state.proposals.push({ id: crypto.randomUUID(), title: $('proposal-title').value.trim(), note: $('proposal-note').value.trim(), votes: [] }); e.target.reset(); save(); });
$('schedule-form').addEventListener('submit', (e) => { e.preventDefault(); if (!$('schedule-proposal').value) return; state.itinerary.push({ id: crypto.randomUUID(), proposalId: $('schedule-proposal').value, date: $('schedule-date').value, time: $('schedule-time').value }); e.target.reset(); save(); });
$('expense-form').addEventListener('submit', (e) => { e.preventDefault(); const split = [...$('split-members').querySelectorAll('input:checked')].map((i) => i.value); if (!split.length) return alert('Choose at least one person to split this expense.'); state.expenses.push({ id: crypto.randomUUID(), title: $('expense-title').value.trim(), payer: $('expense-payer').value, amount: Number($('expense-amount').value), split }); e.target.reset(); save(); });
$('blank-reset').addEventListener('click', () => { if (confirm('Reset Wayfare to a completely blank trip?')) { state = { name: '', destination: '', start: '', end: '', members: [], proposals: [], itinerary: [], expenses: [] }; save(); } });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  if (btn.dataset.vote) { const p = state.proposals.find((x) => x.id === btn.dataset.vote); p.votes = p.votes.includes(btn.dataset.member) ? p.votes.filter((m) => m !== btn.dataset.member) : [...p.votes, btn.dataset.member]; save(); }
  if (btn.dataset.deleteProposal) { state.proposals = state.proposals.filter((p) => p.id !== btn.dataset.deleteProposal); state.itinerary = state.itinerary.filter((i) => i.proposalId !== btn.dataset.deleteProposal); save(); }
  if (btn.dataset.deleteItinerary) { state.itinerary = state.itinerary.filter((i) => i.id !== btn.dataset.deleteItinerary); save(); }
  if (btn.dataset.deleteExpense) { state.expenses = state.expenses.filter((x) => x.id !== btn.dataset.deleteExpense); save(); }
});
render();
