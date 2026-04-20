import React from 'react';
import { CustomerCrmDesk } from '../components/CustomerCrmDesk';

type CustomerCrmTab = 'directory' | 'profiles' | 'enquiries' | 'campaigns' | 'reports';

export const Customers: React.FC<{ initialTab?: CustomerCrmTab }> = ({ initialTab = 'directory' }) => {
  return <CustomerCrmDesk initialTab={initialTab} />;
};
