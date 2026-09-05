import { ScaffoldPage } from '@/components/site/scaffold';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
export const metadata = { title: 'Contact' };
export default function ContactPage() {
  return (
    <ScaffoldPage
      title="Contact"
      description="General questions and feedback, distinct from product support."
    >
      <form aria-label="Contact preview">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="contact-email">Email</FieldLabel>
            <Input
              id="contact-email"
              type="email"
              placeholder="you@example.com"
              disabled
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-message">Message</FieldLabel>
            <Textarea
              id="contact-message"
              placeholder="Your message"
              disabled
            />
            <FieldDescription>
              This form is a non-submitting layout preview. A contact
              destination has not been approved.
            </FieldDescription>
          </Field>
          <Button type="button" disabled>
            Sending is not available
          </Button>
        </FieldGroup>
      </form>
    </ScaffoldPage>
  );
}
