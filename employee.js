
import { auth, db } from './firebase.js';

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import {
  ref, get, onValue, push, set, update, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const $ = id => document.getElementById(id);

let offTasks = () => {};
let offShift = () => {};
let offRequests = () => {};

let userId = null;
let shiftActive = false;
let activeShiftId = null;
let employeeTasks = [];

$('signIn').onclick = async () => {
  try {
    $('loginError').textContent = '';
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(
      auth, $('email').value, $('password').value
    );
  } catch (e) {
    $('loginError').textContent = 'Sign in failed. Check credentials.';
  }
};

$('signOut').onclick = () => signOut(auth);

$('googleSignIn').onclick = async () => {
  try {
    $('loginError').textContent = '';
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    $('loginError').textContent = 'Google sign-in failed. Please try again.';
  }
};

onAuthStateChanged(auth, async user => {
  offTasks();
  offShift();
  offRequests();
  userId = null;

  if (!user) {
    $('login').classList.remove('hidden');
    $('workspace').classList.add('hidden');
    return;
  }

  try {
    const profile = (
      await get(ref(db, `profiles/${user.uid}`))
    ).val();

    if (!profile) {
      const requestRef = ref(db, `accessRequests/${user.uid}`);
      const existing = await get(requestRef);
      if (!existing.exists()) {
        await set(requestRef, {
          email: user.email || '',
          name: user.displayName || user.email || 'New employee',
          state: 'pending',
          createdAt: serverTimestamp()
        });
      }
      await signOut(auth);
      $('loginError').textContent = existing.val()?.state === 'rejected'
        ? 'Your access request was declined. Please contact your administrator.'
        : 'Access request submitted. An administrator must approve your account.';
      return;
    }

    if (profile.role !== 'employee') {
      await signOut(auth);
      $('loginError').textContent = 'This account is not registered as an employee.';
      return;
    }

    userId = user.uid;
    $('userName').textContent = profile.name || user.email;

    $('login').classList.add('hidden');
    $('workspace').classList.remove('hidden');

    offShift = onValue(ref(db, `shifts/${userId}`), snap => {
      const shifts = Object.values(snap.val() || {})
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

      shiftActive = shifts[0]?.status === 'active';
      activeShiftId = shiftActive
        ? Object.entries(snap.val() || {}).find(([, shift]) => shift.status === 'active')?.[0] || null
        : null;

      $('shiftStatus').textContent =
        shiftActive ? 'On duty' : 'Off duty';
    });

    offRequests = onValue(
      ref(db, `taskRequests/${userId}`),
      () => renderEmployeeTasks()
    );

    offTasks = onValue(ref(db, 'tasks'), snap => {
      employeeTasks = Object.entries(snap.val() || {})
        .filter(([, task]) => task.assigneeUid === userId);

      renderEmployeeTasks();
    });

  } catch (e) {
    $('actionError').textContent =
      'Unable to load employee profile. Check Firebase rules.';
  }
});

$('startShift').onclick = async () => {
  if (!userId || shiftActive) return;

  try {
    $('actionError').textContent = '';

    await set(push(ref(db, `shifts/${userId}`)), {
      status: 'active',
      startedAt: serverTimestamp(),
      endedAt: null
    });

  } catch (e) {
    $('actionError').textContent = 'Could not start shift.';
  }
};

$('endShift').onclick = () => {
  if (!userId || !shiftActive || !activeShiftId) return;
  const button = $('endShift');
  button.disabled = true;
  update(ref(db, `shifts/${userId}/${activeShiftId}`), {
    status: 'ended',
    endedAt: serverTimestamp()
  }).then(() => {
    $('actionError').textContent = '';
  }).catch(() => {
    $('actionError').textContent = 'Could not end shift.';
  }).finally(() => {
    button.disabled = false;
  });
};

function renderEmployeeTasks() {
  const box = $('tasks');
  box.replaceChildren();

  if (!employeeTasks.length) {
    box.textContent = 'No tasks assigned yet.';
    return;
  }

  for (const [id, task] of employeeTasks) {
    const card = document.createElement('article');
    card.className =
      'border rounded-xl p-4 mb-3 bg-slate-50';

    const heading = document.createElement('h4');
    heading.className = 'font-bold text-slate-900';
    heading.textContent = task.title;

    const detail = document.createElement('p');
    detail.className = 'text-xs text-slate-500 mt-1';
    detail.textContent =
      `${task.status || 'Assigned'} · ${task.description || 'No description'}`;

    card.append(heading, detail);

    if (!['Approved', 'Rework Required'].includes(task.status)) {
      const notes = document.createElement('textarea');
      notes.placeholder = 'Work update / completion notes';
      notes.maxLength = 1000;
      notes.className =
        'border rounded-lg p-2 w-full mt-3 text-sm';

      card.append(notes);

      const buttons = document.createElement('div');
      buttons.className = 'flex gap-2 mt-2';

      for (const [label, kind] of [
        ['Start work', 'start'],
        ['Submit completion', 'complete']
      ]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.className =
          'rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold';

        button.onclick = async () => {
          if (kind === 'complete' && !notes.value.trim()) {
            $('taskFeedback').textContent =
              'Add completion notes first.';
            return;
          }

          button.disabled = true;

          try {
            await set(push(ref(db, `taskRequests/${userId}`)), {
              taskId: id,
              kind,
              notes: notes.value.trim(),
              createdAt: serverTimestamp(),
              state: 'pending'
            });

            $('taskFeedback').textContent =
              'Update submitted for admin review.';

            notes.value = '';

          } catch (e) {
            $('taskFeedback').textContent =
              'Could not submit update. Check your permissions.';
          } finally {
            button.disabled = false;
          }
        };

        buttons.append(button);
      }

      card.append(buttons);
    }

    box.append(card);
  }
}
