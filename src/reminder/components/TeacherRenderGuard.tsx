import { Component, type ReactNode, type ErrorInfo } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }
export default class TeacherRenderGuard extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(): State { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[reminder:teacher] render failed after state update', { message: error.message, stack: error.stack, componentStack: info.componentStack })
  }
  render() {
    if (this.state.hasError) {
      return <section role="alert" className="teacher-render-error">
        <strong>Não foi possível atualizar a visualização da agenda.</strong>
        <p>Os detalhes do erro foram registrados no console. Você pode recarregar a página para tentar novamente.</p>
        <button type="button" onClick={() => this.setState({ hasError: false })}>Tentar novamente</button>
      </section>
    }
    return this.props.children
  }
}
