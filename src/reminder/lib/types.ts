export type UserRole = 'admin' | 'teacher' | 'student'

export type UserFormState = {
  id?: string
  full_name: string
  email: string
  password: string
  role: UserRole
  class_name: string
  speciality: string
  first_class_at: string
  first_class_teacher_id: string
  cpf?: string
  data_pagamento_preferencial?: number
  chave_pix?: string
  cnpj?: string
  taxa_hora_aula?: number
  cep?: string
  logradouro?: string
  bairro?: string
  cidade?: string
  uf?: string
  tuition_fee?: number
}

export type AccountFormState = {
  full_name: string
  email: string
  password?: string
  confirm_password?: string
}

export type StudentAttendance = 'attend' | 'cancel' | null
export type StudentLessonStatus = 'done' | 'not_done' | null
export type TeacherLessonStatus = 'happened' | 'not_happened' | 'student_no_show' | null
export type BrowserPermission = NotificationPermission | 'unsupported'
export type ReminderIntent =
  | 'attend'
  | 'cancel'
  | 'done'
  | 'not_done'
  | 'happened'
  | 'not_happened'
  | 'student_no_show'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  class_name: string
  speciality: string
  push_enabled: boolean
  created_at?: string
  timezone?: string
  cpf?: string
  data_pagamento_preferencial?: number
  status_pagamento?: 'em_dia' | 'atrasado' | 'pendente' | null
  chave_pix?: string
  cnpj?: string
  status_nota_fiscal?: 'enviada' | 'pendente' | 'nao_se_aplica' | null
  taxa_hora_aula?: number
  moeda_taxa?: string
  status_pagamento_professor?: 'pago' | 'pendente' | null
  cep?: string
  logradouro?: string
  bairro?: string
  cidade?: string
  uf?: string
  tuition_fee?: number
  archived?: boolean
}

export type Lesson = {
  id: string
  subject: string
  class_name: string
  student_id: string
  teacher_id: string
  starts_at: string
  duration_minutes: number
  student_attendance: StudentAttendance
  student_lesson_status: StudentLessonStatus
  teacher_lesson_status: TeacherLessonStatus
  created_at?: string
  ends_at?: string
  status?: 'agendada' | 'concluida' | 'cancelada'
  recurrence?: string
}

export type ReminderNotification = {
  key: string
  title: string
  body: string
  lessonId: string
  userId: string
  actions: { action: string; title: string }[]
  intentMap: Record<string, ReminderIntent>
}

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
