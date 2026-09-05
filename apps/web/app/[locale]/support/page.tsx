import {
  ScaffoldPage,
  ContentSections,
  PreviewLink,
} from '@/components/site/scaffold';
export const metadata = { title: 'Support' };
export default function SupportPage() {
  return (
    <ScaffoldPage
      title="Support"
      description="Help with using Zenbu and troubleshooting product problems."
    >
      <ContentSections
        items={[
          {
            title: 'Getting started',
            body: 'Approved setup instructions will be added here. The local dictionary preview can already be explored from the homepage.',
          },
          {
            title: 'Troubleshooting',
            body: 'Verified answers to common product questions are pending. No support hours or response-time promise has been made.',
          },
          {
            title: 'Report a problem',
            body: 'A support channel and the details needed for reports will be confirmed before publication.',
          },
        ]}
      />
      <PreviewLink href="/contact">General contact preview →</PreviewLink>
    </ScaffoldPage>
  );
}
