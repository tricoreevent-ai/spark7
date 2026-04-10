import React from 'react';
import { CustomerCrmDesk } from '../components/CustomerCrmDesk';

type CustomerCrmTab = 'profiles' | 'enquiries' | 'campaigns' | 'reports';

export const Customers: React.FC<{ initialTab?: CustomerCrmTab }> = ({ initialTab = 'profiles' }) => {
  return <CustomerCrmDesk initialTab={initialTab} />;
};
