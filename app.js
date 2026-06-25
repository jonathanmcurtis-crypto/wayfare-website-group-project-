const LAST_TRIP_KEY = 'wayfare.lastTripId.v1';
const $ = (id) => document.getElementById(id);

const sampleTrip = {
  name: 'Barcelona Long Weekend',
  destination: 'Barcelona, Spain',
  start: '2026-08-14',
  end: '2026-08-17',
  members: ['Ava', 'Mateo', 'Priya', 'Jordan'],
  proposals: [
    { title: 'Sagrada Família morning tour', note: 'Book early entry and grab pastries nearby after.', votes: ['Ava', 'Priya', 'Jordan'] },
    { title: 'Tapas crawl in El Born', note: 'Keep it flexible and share plates across a few stops.', votes: ['Ava', 'Mateo', 'Priya', 'Jordan'] },
    { title: 'Beach afternoon at Barceloneta', note: 'Low-cost reset day with swims and snacks.', votes: ['Mateo', 'Jordan'] }
  ],
  itinerary: [],
  expenses: []
};
sampleTrip.itinerary = [
  { proposalTitle: sampleTrip.proposals[0].title, date: '2026-08-15', time: '09:30' },
  { proposalTitle: sampleTrip.proposals[1].title, date: '2026-08-15', time: '19:00' }
];
sampleTrip.expenses = [
  { title: 'Apartment deposit', payer: 'Ava', amount: 480, split: ['Ava', 'Mateo', 'Priya', 'Jordan'] },
  { title: 'Museum tickets', payer: 'Priya', amount: 96, split: ['Ava', 'Priya', 'Jordan'] }
];

let state = blankState();
let supabaseClient = null;
let currentTripId = new URLSearchParams(window.location.search).get('trip');

function blankState() {
  return { id: '', name: '', destination: '', start: '', end: '', members: [], memberRecords: [], proposals: [], itinerary: [], expenses: [] };
}
function getConfig() { return window.WAYFARE_CONFIG || {}; }
function isConfigured() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_URL.includes('YOUR_') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_'));
}
function setStatus(message, type = 'info') {
  const el = $('app-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = message ? `status ${type}` : 'status';
}
function setBusy(isBusy) {
  document.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = isBusy; });
}
async function runAction(message, action) {
  try {
    setBusy(true);
    setStatus(message);
    await action();
    setStatus('Saved to Supabase.', 'success');
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}
function showError(error) {
  console.error(error);
  setStatus(error.message || 'Something went wrong while talking to Supabase.', 'error');
}
function requireSupabase() {
  if (!supabaseClient) throw new Error('Supabase is not configured yet. Add your project URL and publishable key in index.html.');
  return supabaseClient;
}
function memberIdByName(name) { return state.memberRecords.find((m) => m.name === name)?.id; }
function money(n) { return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }
function dateLabel(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
function tripDays() {
  if (!state.start || !state.end) return [];
  const days = [];
  for (let d = new Date(`${state.start}T12:00:00`), end = new Date(`${state.end}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}
function empty(text) { return `<div class="empty">${text}</div>`; }

async function fetchTrip(tripId) {
  const client = requireSupabase();
  const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
  if (tripError) throw tripError;

  const [membersResult, proposalsResult, itineraryResult, expensesResult] = await Promise.all([
    client.from('trip_members').select('*').eq('trip_id', tripId).order('created_at'),
    client.from('proposals').select('*').eq('trip_id', tripId).order('created_at'),
    client.from('itinerary_items').select('*').eq('trip_id', tripId).order('scheduled_date').order('scheduled_time'),
    client.from('expenses').select('*').eq('trip_id', tripId).order('created_at')
  ]);
  [membersResult, proposalsResult, itineraryResult, expensesResult].forEach((result) => { if (result.error) throw result.error; });

  const proposalIds = proposalsResult.data.map((proposal) => proposal.id);
  const expenseIds = expensesResult.data.map((expense) => expense.id);
  const [votesResult, splitsResult] = await Promise.all([
    proposalIds.length ? client.from('proposal_votes').select('*').in('proposal_id', proposalIds) : Promise.resolve({ data: [], error: null }),
    expenseIds.length ? client.from('expense_splits').select('*').in('expense_id', expenseIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (votesResult.error) throw votesResult.error;
  if (splitsResult.error) throw splitsResult.error;

  const memberNames = Object.fromEntries(membersResult.data.map((member) => [member.id, member.name]));
  return {
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    start: trip.start_date,
    end: trip.end_date,
    memberRecords: membersResult.data,
    members: membersResult.data.map((member) => member.name),
    proposals: proposalsResult.data.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      note: proposal.note || '',
      votes: votesResult.data.filter((vote) => vote.proposal_id === proposal.id).map((vote) => memberNames[vote.member_id]).filter(Boolean)
    })),
    itinerary: itineraryResult.data.map((item) => ({ id: item.id, proposalId: item.proposal_id, date: item.scheduled_date, time: item.scheduled_time || '' })),
    expenses: expensesResult.data.map((expense) => ({
      id: expense.id,
      title: expense.title,
      payer: memberNames[expense.payer_member_id] || 'Unknown member',
      amount: Number(expense.amount),
      split: splitsResult.data.filter((split) => split.expense_id === expense.id).map((split) => memberNames[split.member_id]).filter(Boolean)
    }))
  };
}

async function createTrip(data) {
  const client = requireSupabase();
  const { data: trip, error } = await client.from('trips').insert({ name: data.name, destination: data.destination, start_date: data.start, end_date: data.end }).select().single();
  if (error) throw error;
  const memberRecords = await upsertMembers(trip.id, data.members);
  const proposalMap = new Map();
  for (const proposal of data.proposals || []) {
    const created = await createProposal({ tripId: trip.id, title: proposal.title, note: proposal.note || '' }, false);
    proposalMap.set(proposal.title, created.id);
    for (const voter of proposal.votes || []) await insertVote(created.id, memberRecords.find((member) => member.name === voter)?.id);
  }
  for (const item of data.itinerary || []) await createItineraryItem({ tripId: trip.id, proposalId: proposalMap.get(item.proposalTitle), date: item.date, time: item.time }, false);
  for (const expense of data.expenses || []) await createExpense({ tripId: trip.id, title: expense.title, payer: expense.payer, amount: expense.amount, split: expense.split }, false, memberRecords);
  return trip.id;
}
async function updateTrip(data) {
  const client = requireSupabase();
  const { error } = await client.from('trips').update({ name: data.name, destination: data.destination, start_date: data.start, end_date: data.end }).eq('id', state.id);
  if (error) throw error;
  await upsertMembers(state.id, data.members);
  await refreshTrip();
}
async function upsertMembers(tripId, names) {
  const client = requireSupabase();
  const rows = names.map((name) => ({ trip_id: tripId, name }));
  if (rows.length) {
    const { error } = await client.from('trip_members').upsert(rows, { onConflict: 'trip_id,name' });
    if (error) throw error;
  }
  const { data, error } = await client.from('trip_members').select('*').eq('trip_id', tripId).order('created_at');
  if (error) throw error;
  return data;
}
async function createProposal(data, shouldRefresh = true) {
  const client = requireSupabase();
  const { data: proposal, error } = await client.from('proposals').insert({ trip_id: data.tripId || state.id, title: data.title, note: data.note }).select().single();
  if (error) throw error;
  if (shouldRefresh) await refreshTrip();
  return proposal;
}
async function insertVote(proposalId, memberId) {
  if (!memberId) return;
  const { error } = await requireSupabase().from('proposal_votes').insert({ proposal_id: proposalId, member_id: memberId });
  if (error && error.code !== '23505') throw error;
}
async function toggleVote(proposalId, memberName) {
  const client = requireSupabase();
  const memberId = memberIdByName(memberName);
  if (!memberId) throw new Error(`Could not find member ${memberName}.`);
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (proposal?.votes.includes(memberName)) {
    const { error } = await client.from('proposal_votes').delete().eq('proposal_id', proposalId).eq('member_id', memberId);
    if (error) throw error;
  } else {
    await insertVote(proposalId, memberId);
  }
  await refreshTrip();
}
async function createItineraryItem(data, shouldRefresh = true) {
  const { error } = await requireSupabase().from('itinerary_items').insert({ trip_id: data.tripId || state.id, proposal_id: data.proposalId || null, scheduled_date: data.date, scheduled_time: data.time || null });
  if (error) throw error;
  if (shouldRefresh) await refreshTrip();
}
async function createExpense(data, shouldRefresh = true, memberRecords = state.memberRecords) {
  const client = requireSupabase();
  const payerId = memberRecords.find((member) => member.name === data.payer)?.id;
  if (!payerId) throw new Error('Choose a valid payer before saving the expense.');
  const { data: expense, error } = await client.from('expenses').insert({ trip_id: data.tripId || state.id, title: data.title, payer_member_id: payerId, amount: data.amount }).select().single();
  if (error) throw error;
  const splitRows = data.split.map((name) => ({ expense_id: expense.id, member_id: memberRecords.find((member) => member.name === name)?.id })).filter((row) => row.member_id);
  if (splitRows.length) {
    const { error: splitError } = await client.from('expense_splits').insert(splitRows);
    if (splitError) throw splitError;
  }
  if (shouldRefresh) await refreshTrip();
}
async function deleteProposal(id) {
  const { error } = await requireSupabase().from('proposals').delete().eq('id', id);
  if (error) throw error;
  await refreshTrip();
}
async function deleteItineraryItem(id) {
  const { error } = await requireSupabase().from('itinerary_items').delete().eq('id', id);
  if (error) throw error;
  await refreshTrip();
}
async function deleteExpense(id) {
  const { error } = await requireSupabase().from('expenses').delete().eq('id', id);
  if (error) throw error;
  await refreshTrip();
}
async function refreshTrip() {
  state = await fetchTrip(currentTripId);
  localStorage.setItem(LAST_TRIP_KEY, currentTripId);
  render();
}
function setTripUrl(tripId) {
  currentTripId = tripId;
  localStorage.setItem(LAST_TRIP_KEY, tripId);
  const url = new URL(window.location.href);
  url.searchParams.set('trip', tripId);
  window.history.replaceState({}, '', url);
}

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

$('trip-form').addEventListener('submit', (e) => { e.preventDefault(); const members = $('trip-members').value.split(',').map((m) => m.trim()).filter(Boolean); runAction('Saving trip to Supabase...', () => updateTrip({ name: $('trip-name').value.trim(), destination: $('trip-destination').value.trim(), start: $('trip-start').value, end: $('trip-end').value, members })); });
$('proposal-form').addEventListener('submit', (e) => { e.preventDefault(); runAction('Adding proposal...', async () => { await createProposal({ title: $('proposal-title').value.trim(), note: $('proposal-note').value.trim() }); e.target.reset(); }); });
$('schedule-form').addEventListener('submit', (e) => { e.preventDefault(); if (!$('schedule-proposal').value) return; runAction('Adding itinerary item...', async () => { await createItineraryItem({ proposalId: $('schedule-proposal').value, date: $('schedule-date').value, time: $('schedule-time').value }); e.target.reset(); }); });
$('expense-form').addEventListener('submit', (e) => { e.preventDefault(); const split = [...$('split-members').querySelectorAll('input:checked')].map((i) => i.value); if (!split.length) return alert('Choose at least one person to split this expense.'); runAction('Adding expense...', async () => { await createExpense({ title: $('expense-title').value.trim(), payer: $('expense-payer').value, amount: Number($('expense-amount').value), split }); e.target.reset(); }); });
$('blank-reset').addEventListener('click', () => { if (confirm('Create a new sample trip in Supabase and switch this browser to that shared link?')) runAction('Creating a new sample trip...', async () => { const tripId = await createTrip(sampleTrip); setTripUrl(tripId); await refreshTrip(); }); });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  if (btn.dataset.vote) runAction('Updating vote...', () => toggleVote(btn.dataset.vote, btn.dataset.member));
  if (btn.dataset.deleteProposal) runAction('Removing proposal...', () => deleteProposal(btn.dataset.deleteProposal));
  if (btn.dataset.deleteItinerary) runAction('Removing itinerary item...', () => deleteItineraryItem(btn.dataset.deleteItinerary));
  if (btn.dataset.deleteExpense) runAction('Removing expense...', () => deleteExpense(btn.dataset.deleteExpense));
});

async function init() {
  try {
    setBusy(true);
    setStatus('Connecting to Supabase...');
    if (!isConfigured()) throw new Error('Add your Supabase URL and publishable key in the WAYFARE_CONFIG section of index.html before using the app.');
    if (!window.supabase?.createClient) throw new Error('Supabase CDN script did not load. Check your internet connection and script tag.');
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    if (!currentTripId) {
      setStatus('No shared trip link found. Creating a sample trip in Supabase...');
      currentTripId = await createTrip(sampleTrip);
      setTripUrl(currentTripId);
    }
    await refreshTrip();
    setStatus('Loaded from Supabase.', 'success');
  } catch (error) {
    state = blankState();
    render();
    showError(error);
  } finally {
    setBusy(false);
  }
}

init();
