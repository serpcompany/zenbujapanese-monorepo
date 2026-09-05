// Adapted from shadcn/ui new-york Card and Switch (MIT). See SOURCES.md.
import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({className='', ...props}, ref) => <div ref={ref} className={`card ${className}`} {...props}/>);
Card.displayName='Card';
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>((props,ref) => <SwitchPrimitives.Root className="switch" {...props} ref={ref}><SwitchPrimitives.Thumb className="switch-thumb"/></SwitchPrimitives.Root>);
Switch.displayName='Switch';
