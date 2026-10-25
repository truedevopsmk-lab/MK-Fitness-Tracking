import PageHeader from '../components/PageHeader'
import Empty from '../components/Empty'

export default function Placeholder({ title }) {
  return <div className="page">
    <PageHeader title={title} />
    <div className="card"><Empty icon="activity" title="Coming together" body="This page is being built." /></div>
  </div>
}
