const fs = require('fs');
const path = require('path');

const REQUIRED_VARS = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
];

const RECOMMENDED_VARS = [
    'SENTRY_DSN',
    'NODE_ENV',
    'APP_VERSION',
];

function validate() {
    const missingRequired = REQUIRED_VARS.filter(v => !process.env[v]);
    const missingRecommended = RECOMMENDED_VARS.filter(v => !process.env[v]);

    if (missingRequired.length > 0) {
        console.error('❌ Missing critical environment variables:');
        missingRequired.forEach(v => console.error(`   - ${v}`));
        process.exit(1);
    }

    if (missingRecommended.length > 0) {
        console.warn('⚠️  Missing recommended environment variables:');
        missingRecommended.forEach(v => console.warn(`   - ${v}`));
    } else {
        console.log('✅ All environment variables are set correctly.');
    }
}

validate();
