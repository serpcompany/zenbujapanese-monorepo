import { ScaffoldPage, ContentSections } from '@/components/site/scaffold';
export const metadata = { title: 'About' };
export default function AboutPage() {
  return (
    <ScaffoldPage
      title="About Zenbu"
      description="The purpose, people, and dictionary sources behind the website."
    >
      <ContentSections
        items={[
          {
            title: 'Our purpose',
            body: 'The website presents the Zenbu Japanese dictionary experience in a browser. Final mission and team copy are pending.',
          },
          {
            title: 'Dictionary sources',
            body: 'The current dictionary sample retains JMdict/EDRDG provenance, TUBELEX frequency context, UniDic pitch data, and a Tatoeba sentence. Source attribution is visible with the sample.',
          },
        ]}
      />
      <a className="preview-link" href="/data-notices.txt">
        Read sample data notices
      </a>
    </ScaffoldPage>
  );
}
