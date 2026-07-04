import { useEffect, useState } from 'react'
import { Profile, UserRole } from '../lib/types'

interface EditableUserRowProps {
  user: Profile
  onSave: (user: Profile & { password?: string }) => Promise<void>
  onDelete: (userId: string) => Promise<void>
  saving: boolean
  deleting: boolean
}

export default function EditableUserRow({
  user,
  onSave,
  onDelete,
  saving,
  deleting,
}: EditableUserRowProps) {
  const [draft, setDraft] = useState<Profile & { password?: string }>(user)

  useEffect(() => {
    setDraft(user)
  }, [user])

  return (
    <div className="user-row">
      <input value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} />
      <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
      <input
        placeholder="New password"
        value={draft.password ?? ''}
        onChange={(event) => setDraft({ ...draft, password: event.target.value })}
      />
      <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
        <option value="admin">Admin</option>
      </select>
      {draft.role === 'student' ? (
        <input value={draft.class_name} onChange={(event) => setDraft({ ...draft, class_name: event.target.value })} />
      ) : (
        <input value={draft.speciality} onChange={(event) => setDraft({ ...draft, speciality: event.target.value })} />
      )}
      <div className="button-stack">
        <button className="secondary-button" disabled={saving || deleting} onClick={() => void onSave(draft)}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="danger-button" disabled={saving || deleting} onClick={() => void onDelete(user.id)}>
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
