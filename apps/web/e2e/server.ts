export const onClosedProduction = process.env.E2E_SITE_ENV === 'production'

export const onProductionBuild = process.env.E2E_SERVER === 'preview' || onClosedProduction
