
import { db } from './firebase-db.js';

import {
  ref, onValue, push, set, update, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);

let unsub = [];
let employees = {};
let tasksCache = {};
let requestsCache = {};
let accessCache = {};
const DEFAULT_CREDENTIALS = { username: 'admin', password: 'admin123' };
const CREDENTIALS_KEY = 'kb-workforce-admin-credentials';
const SESSION_KEY = 'kb-workforce-admin-session';
const adminId = 'local-admin';

function getCredentials() {
  try { return JSON.parse(localStorage.getItem(CREDENTIALS_KEY)) || DEFAULT_CREDENTIALS; }
  catch { return DEFAULT_CREDENTIALS; }
}

function showDashboard() {
  $('login').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('adminEmail').textContent = `Signed in as ${getCredentials().username}`;
  loadDashboardData();
}

$('signIn').onclick = () => {
  $('loginError').textContent = '';
  const credentials = getCredentials();
  if ($('username').value.trim() !== credentials.username || $('password').value !== credentials.password) {
    $('loginError').textContent = 'Incorrect username or password.';
    return;
  }
  sessionStorage.setItem(SESSION_KEY, '1');
  showDashboard();
};

$('signOut').onclick = () => {
  sessionStorage.removeItem(SESSION_KEY);
  unsub.forEach(fn => fn());
  unsub = [];
  $('dashboard').classList.add('hidden');
  $('login').classList.remove('hidden');
};

$('credentialsForm').onsubmit = event => {
  event.preventDefault();
  const username = $('newUsername').value.trim();
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, password: $('newPassword').value }));
  $('credentialsFeedback').textContent = 'Credentials saved in this browser.';
  $('adminEmail').textContent = `Signed in as ${username}`;
  $('credentialsForm').reset();
};

if (sessionStorage.getItem(SESSION_KEY) === '1') showDashboard();

for (const button of document.querySelectorAll('.nav')) {
  button.onclick = () => {
    const page = button.dataset.page;

    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('hidden', el.id !== page);
    });

    document.querySelectorAll('.nav').forEach(el => {
      el.classList.toggle('bg-indigo-600', el === button);
    });

    $('pageTitle').textContent =
      page[0].toUpperCase() + page.slice(1);
  };
}

function makeRow(text) {
  const el = document.createElement('div');
  el.className = 'border-b py-3';
  el.textContent = text;
  return el;
}

function loadDashboardData() {
  unsub.forEach(fn => fn());
  unsub = [];

  try {
    unsub.push(onValue(ref(db, 'profiles'), snap => {
      employees = Object.fromEntries(
        Object.entries(snap.val() || {})
          .filter(([, p]) => p.role === 'employee')
      );

      $('employeeCount').textContent =
        Object.keys(employees).length;

      $('employeeList').replaceChildren();
      $('assignee').replaceChildren(
        new Option('Select employee', '')
      );

      for (const [uid, profile] of Object.entries(employees)) {
        $('employeeList').append(
          makeRow(`${profile.name || uid} · ${profile.team || 'Unassigned'}`)
        );

        $('assignee').add(
          new Option(profile.name || uid, uid)
        );
      }

      renderTaskReviews();
    }));

    unsub.push(onValue(ref(db, 'tasks'), snap => {
      tasksCache = snap.val() || {};
      $('taskCount').textContent =
        Object.keys(tasksCache).length;
      renderTaskReviews();
    }));

    unsub.push(onValue(ref(db, 'taskRequests'), snap => {
      requestsCache = snap.val() || {};
      renderTaskReviews();
    }));

    unsub.push(onValue(ref(db, 'accessRequests'), snap => {
      accessCache = snap.val() || {};
      renderAccessRequests();
    }));

    unsub.push(onValue(ref(db, 'shifts'), snap => {
      let active = 0;
      const rows = [];

      for (const [uid, records] of Object.entries(snap.val() || {})) {
        for (const [id, shift] of Object.entries(records || {})) {
          if (shift.status === 'active') active++;

          const date = shift.startedAt
            ? new Date(shift.startedAt).toLocaleString(
                'en-IN', { timeZone: 'Asia/Kolkata' }
              )
            : 'Pending';

          rows.push(
            makeRow(
              `${employees[uid]?.name || uid} · ${shift.status} · ${date}`
            )
          );
        }
      }

      $('activeCount').textContent = active;
      $('attendanceList').replaceChildren(...rows);
    }));

  } catch (e) {
    $('actionError').textContent =
      'Firebase rejected the admin data request. Local credentials do not grant database access; admin data requires trusted server or Firebase admin authorization.';
  }
}

$('taskForm').onsubmit = async event => {
  event.preventDefault();

  try {
    $('actionError').textContent = '';

    await set(push(ref(db, 'tasks')), {
      title: $('taskTitle').value.trim(),
      description: $('taskDescription').value.trim(),
      assigneeUid: $('assignee').value,
      status: 'Assigned',
      createdAt: serverTimestamp(),
      createdBy: adminId
    });

    $('taskForm').reset();

  } catch (e) {
    $('actionError').textContent =
      'Unable to assign task. Check permissions.';
  }
};

function renderTaskReviews() {
  const box = $('taskList');
  box.replaceChildren();

  for (const [id, task] of Object.entries(tasksCache)) {
    const card = document.createElement('article');
    card.className = 'border rounded-xl p-4 mb-3';

    const heading = document.createElement('h3');
    heading.className = 'font-bold';
    heading.textContent = task.title;

    const meta = document.createElement('p');
    meta.className = 'text-slate-500 text-xs mt-1';
    meta.textContent =
      `${employees[task.assigneeUid]?.name || task.assigneeUid} · ${task.status || 'Assigned'}`;

    card.append(heading, meta);

    const requests = Object.entries(
      requestsCache[task.assigneeUid] || {}
    )
      .filter(([, request]) => request.taskId === id)
      .sort((a, b) =>
        (b[1].createdAt || 0) - (a[1].createdAt || 0)
      );

    for (const [requestId, request] of requests) {
      const line = document.createElement('div');
      line.className = 'mt-3 border-t pt-3';

      const description = document.createElement('p');
      description.className = 'text-xs';

      const date = request.createdAt
        ? new Date(request.createdAt).toLocaleString(
            'en-IN', { timeZone: 'Asia/Kolkata' }
          )
        : 'Pending timestamp';

      description.textContent =
        `${request.kind === 'complete' ? 'Completion' : 'Start'} request · ` +
        `${request.state || 'pending'} · ` +
        `${request.notes || 'No notes'} · ${date}`;

      line.append(description);

      if (request.state === 'pending') {
        const buttons = document.createElement('div');
        buttons.className = 'flex gap-2 mt-2';

        const actions = [
          [
            'Approve',
            request.kind === 'complete' ? 'Approved' : 'In Progress',
            'bg-emerald-600'
          ],
          [
            'Return for rework',
            'Rework Required',
            'bg-amber-600'
          ]
        ];

        for (const [label, status, css] of actions) {
          const button = document.createElement('button');
          button.textContent = label;
          button.className =
            `${css} text-white rounded-lg px-3 py-2 text-xs`;

          button.onclick = async () => {
            button.disabled = true;

            try {
              await update(ref(db), {
                [`tasks/${id}/status`]: status,
                [`tasks/${id}/reviewedAt`]: serverTimestamp(),
                [`tasks/${id}/reviewedBy`]: adminId,
                [`taskRequests/${task.assigneeUid}/${requestId}/state`]:
                  status === 'Rework Required'
                    ? 'rejected'
                    : 'approved',
                [`taskRequests/${task.assigneeUid}/${requestId}/reviewedAt`]:
                  serverTimestamp(),
                [`taskRequests/${task.assigneeUid}/${requestId}/reviewedBy`]:
                  adminId
              });

              $('reviewFeedback').textContent = 'Review saved.';

            } catch (e) {
              $('reviewFeedback').textContent =
                'Review failed. Check database rules.';
            } finally {
              button.disabled = false;
            }
          };

          buttons.append(button);
        }

        line.append(buttons);
      }

      card.append(line);
    }

    box.append(card);
  }

  if (!Object.keys(tasksCache).length) {
    box.textContent = 'No tasks yet.';
  }
}

function renderAccessRequests() {
  const box = $('accessRequests');
  const entries = Object.entries(accessCache)
    .filter(([, request]) => request.state === 'pending');
  box.replaceChildren();

  if (!entries.length) {
    box.textContent = 'No pending access requests.';
    return;
  }

  for (const [uid, request] of entries) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const details = document.createElement('p');
    details.textContent = `${request.name || 'Employee'} · ${request.email || 'No email'}`;
    row.append(details);

    for (const [label, state] of [['Approve', 'approved'], ['Decline', 'rejected']]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = 'access-action';
      button.style.marginRight = '8px';
      button.onclick = async () => {
        button.disabled = true;
        const changes = {
          [`accessRequests/${uid}/state`]: state,
          [`accessRequests/${uid}/reviewedAt`]: serverTimestamp(),
          [`accessRequests/${uid}/reviewedBy`]: adminId
        };
        if (state === 'approved') {
          changes[`profiles/${uid}`] = {
            role: 'employee',
            name: request.name || request.email || 'Employee',
            email: request.email || '',
            team: 'Unassigned'
          };
        }

        try {
          await update(ref(db), changes);
        } catch (e) {
          $('actionError').textContent = 'Could not update access request. Check Firebase rules.';
        } finally {
          button.disabled = false;
        }
      };
      row.append(button);
    }
    box.append(row);
  }
}
