import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faLock, faMagnifyingGlass, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useConfirm } from '../../components/ConfirmDialog';
import { Button, Checkbox, Switch } from '../../components/ui';
import { PermissionEntry } from '../../services/roles';
import { Role } from '../../types';
import { actionLabel, groupPermissions, isViewAction, moduleInfo, permissionHint } from './permissionCatalog';
import styles from './RoleEditor.module.css';

export interface RolePayload {
  name: string;
  description: string;
  permissionIds: number[];
  mfaRequired: boolean;
}

interface RoleEditorProps {
  mode: 'create' | 'edit';
  /** The role being edited, with its permissions. */
  role?: Role;
  /** Existing roles, offered as starting points when creating one. */
  roles: Role[];
  permsByModule: Record<string, PermissionEntry[]>;
  onClose: () => void;
  onSave: (payload: RolePayload) => Promise<void>;
}

const SUPER_ADMIN = 'super-admin';

export function RoleEditor({ mode, role, roles, permsByModule, onClose, onSave }: RoleEditorProps) {
  const confirm = useConfirm();
  const initialIds = useMemo(() => new Set(role?.permissions?.map((p) => p.id) ?? []), [role]);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [mfaRequired, setMfaRequired] = useState(role?.mfaRequired ?? false);
  const [selected, setSelected] = useState<Set<number>>(initialIds);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const isSystem = mode === 'edit' && !!role?.isSystem;
  // Super-admin always holds everything; trimming it could lock the site's owner out.
  const permsLocked = role?.name === SUPER_ADMIN;
  const groups = useMemo(() => groupPermissions(permsByModule), [permsByModule]);
  const allPerms = useMemo(() => groups.flatMap((g) => g.modules.flatMap((m) => m.perms)), [groups]);

  const added = [...selected].filter((id) => !initialIds.has(id)).length;
  const removed = [...initialIds].filter((id) => !selected.has(id)).length;
  const dirty = added > 0 || removed > 0 || name !== (role?.name ?? '') || description !== (role?.description ?? '') || mfaRequired !== (role?.mfaRequired ?? false);

  async function requestClose() {
    if (saving) return;
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'Your changes to this role haven’t been saved.', confirmLabel: 'Discard', danger: true }))) return;
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); requestClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function update(fn: (next: Set<number>) => void) {
    if (permsLocked) return;
    setSelected((prev) => { const next = new Set(prev); fn(next); return next; });
  }

  // Any action needs View to be usable, so turning one on turns View on, and turning View off clears the area.
  function togglePerm(perms: PermissionEntry[], perm: PermissionEntry) {
    const view = perms.find((p) => isViewAction(p.action));
    update((next) => {
      if (next.has(perm.id)) {
        if (isViewAction(perm.action)) perms.forEach((p) => next.delete(p.id));
        else next.delete(perm.id);
      } else {
        next.add(perm.id);
        if (view) next.add(view.id);
      }
    });
  }

  const setAll = (perms: PermissionEntry[], on: boolean) => update((next) => perms.forEach((p) => (on ? next.add(p.id) : next.delete(p.id))));
  const allOn = (perms: PermissionEntry[]) => perms.every((p) => selected.has(p.id));
  const someOn = (perms: PermissionEntry[]) => perms.some((p) => selected.has(p.id));

  function copyFrom(source: Role) {
    const valid = new Set(allPerms.map((p) => p.id));
    setSelected(new Set((source.permissions ?? []).map((p) => p.id).filter((id) => valid.has(id))));
  }

  const q = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      modules: g.modules.filter(({ module, perms }) => {
        if (!q) return true;
        const info = moduleInfo(module);
        return [info.label, info.hint, module, ...perms.map((p) => actionLabel(p.action, p.module))].some((s) => s.toLowerCase().includes(q));
      }),
    }))
    .filter((g) => g.modules.length);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), permissionIds: [...selected], mfaRequired });
    } finally {
      setSaving(false);
    }
  }

  const summary = mode === 'edit'
    ? (added || removed ? [added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(' · ') : 'No permission changes')
    : `${selected.size} of ${allPerms.length} permissions`;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="role-editor-title" onSubmit={submit}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="role-editor-title">
              {mode === 'create' ? 'New role' : <>Edit role <span className={styles.headName}>{role?.name}</span></>}
              {isSystem && <span className={styles.badge}>Built-in</span>}
            </h2>
            <p>Choose what people with this role can see and do in the admin.</p>
          </div>
          <button type="button" className={styles.close} onClick={requestClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>

        <div className={styles.body}>
          <section className={styles.details} aria-label="Role details">
            <label className={styles.field}>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. reviewer" required disabled={saving || isSystem} autoFocus={mode === 'create'} />
              {isSystem && <small><FontAwesomeIcon icon={faLock} /> Built-in roles keep their name.</small>}
            </label>
            <label className={styles.field}>
              <span>Description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" disabled={saving} />
            </label>
            <div className={styles.mfa}>
              <div>
                <strong>Require two-factor sign-in</strong>
                <small>People with this role must set up an authenticator app before they can sign in.</small>
              </div>
              <Switch checked={mfaRequired} onChange={setMfaRequired} label="Require two-factor sign-in" disabled={saving} />
            </div>
            {mode === 'create' && roles.length > 0 && (
              <div className={styles.copy}>
                <span>Start from</span>
                {roles.map((r) => (
                  <button key={r.id} type="button" className={styles.copyChip} onClick={() => copyFrom(r)} title={`Copy the ${r.name} role’s permissions`}>{r.name}</button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.perms} aria-label="Permissions">
            <div className={styles.permsBar}>
              <div className={styles.permsTitle}>
                <h3>Permissions</h3>
                <span>{selected.size} of {allPerms.length}</span>
              </div>
              <label className={styles.search}>
                <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter permissions" aria-label="Filter permissions" />
              </label>
              {!permsLocked && (
                <div className={styles.bulk}>
                  <button type="button" onClick={() => setAll(allPerms, true)} disabled={saving}>Select all</button>
                  <button type="button" onClick={() => setAll(allPerms, false)} disabled={saving}>Clear</button>
                </div>
              )}
            </div>

            {permsLocked && (
              <p className={styles.locked}><FontAwesomeIcon icon={faLock} /> Super-admin always has every permission, so these can’t be changed.</p>
            )}

            {visibleGroups.map((g) => {
              const groupPerms = g.modules.flatMap((m) => m.perms);
              const on = groupPerms.filter((p) => selected.has(p.id)).length;
              return (
                <div key={g.title} className={styles.group}>
                  <div className={styles.groupHead}>
                    <h4>{g.title}</h4>
                    <span className={styles.groupCount}>{on}/{groupPerms.length}</span>
                    {!permsLocked && (
                      <button type="button" onClick={() => setAll(groupPerms, !allOn(groupPerms))} disabled={saving}>
                        {allOn(groupPerms) ? 'Clear group' : 'Select group'}
                      </button>
                    )}
                  </div>
                  <ul className={styles.rows}>
                    {g.modules.map(({ module, perms }) => {
                      const info = moduleInfo(module);
                      return (
                        <li key={module} className={styles.row}>
                          <div className={styles.rowMain}>
                            {!permsLocked && (
                              <Checkbox checked={allOn(perms)} indeterminate={someOn(perms) && !allOn(perms)} onChange={() => setAll(perms, !allOn(perms))} label={`All ${info.label} permissions`} />
                            )}
                            <div className={styles.rowText}>
                              <span className={styles.rowLabel}>{info.label}</span>
                              {info.hint && <span className={styles.rowHint}>{info.hint}</span>}
                            </div>
                          </div>
                          <div className={styles.pills}>
                            {perms.map((p) => {
                              const active = selected.has(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`${styles.pill} ${active ? styles.pillOn : ''}`}
                                  aria-pressed={active}
                                  title={permissionHint(p.module, p.action) ?? p.description ?? undefined}
                                  onClick={() => togglePerm(perms, p)}
                                  disabled={saving || permsLocked}
                                >
                                  <FontAwesomeIcon icon={active ? faCheck : faPlus} className={styles.pillIcon} aria-hidden="true" />
                                  {actionLabel(p.action, p.module)}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {visibleGroups.length === 0 && <p className={styles.noMatch}>No permissions match “{query}”.</p>}
            {!permsLocked && <p className={styles.footnote}>Turning on any action also turns on View for that area. Hover an action to see what it allows.</p>}
          </section>
        </div>

        <footer className={styles.foot}>
          <span className={`${styles.summary} ${mode === 'edit' && (added || removed) ? styles.summaryChanged : ''}`}>{summary}</span>
          <Button onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim() || (mode === 'edit' && !dirty)}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save changes'}
          </Button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
