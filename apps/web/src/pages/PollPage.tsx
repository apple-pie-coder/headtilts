import { useParams } from 'react-router-dom';
import { PollWidget } from '../components/PollWidget';

export default function PollPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return (
    <div className="container" style={{ maxWidth: 600, paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <PollWidget slug={slug} />
    </div>
  );
}
