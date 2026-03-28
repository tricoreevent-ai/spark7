import mongoose from 'mongoose';
import { tenantScopedPlugin } from './plugins/tenantScoped.js';

mongoose.plugin(tenantScopedPlugin);

