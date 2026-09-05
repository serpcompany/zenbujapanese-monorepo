import { notFound } from 'next/navigation';
import {
  ScaffoldPage,
  ContentSections,
  PreviewLink,
} from '@/components/site/scaffold';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
export const metadata = { title: 'Dictionary walkthrough — Video preview' };
export default async function WatchPage({
  params,
}: PageProps<'/[locale]/watch/[video]'>) {
  if ((await params).video !== 'dictionary-walkthrough') notFound();
  return (
    <ScaffoldPage
      title="Dictionary walkthrough"
      description="Video playback, transcript, and supporting references for one video."
    >
      <div className="video-preview">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Video not supplied</EmptyTitle>
            <EmptyDescription>
              No media file, recording, duration, or transcript has been
              published.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
      <ContentSections
        items={[
          {
            title: 'Transcript',
            body: 'A transcript will appear here after the video and its text have been supplied and approved.',
          },
          {
            title: 'Related materials',
            body: 'Source-backed references may accompany the approved video.',
          },
        ]}
      />
      <PreviewLink href="/videos">Back to videos →</PreviewLink>
    </ScaffoldPage>
  );
}
