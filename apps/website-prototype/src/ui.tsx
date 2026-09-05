// Adapted from shadcn/ui new-york Card and Switch registry. MIT; see THIRD-PARTY.md.
import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = '', ...props }, ref) => <div ref={ref} className={`card ${className}`} {...props}/>);
Card.displayName = 'Card';
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = '', ...props }, ref) => <div ref={ref} className={`card-header ${className}`} {...props}/>);
CardHeader.displayName = 'CardHeader';
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = '', ...props }, ref) => <div ref={ref} className={`card-content ${className}`} {...props}/>);
CardContent.displayName = 'CardContent';
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>,React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(({ className = '', ...props },ref) => <SwitchPrimitives.Root className={`switch ${className}`} {...props} ref={ref}><SwitchPrimitives.Thumb className="switch-thumb"/></SwitchPrimitives.Root>);
Switch.displayName = SwitchPrimitives.Root.displayName;
