const gitLocation = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']

export const withoutGitLocation = environment =>
  Object.fromEntries(Object.entries(environment).filter(([name]) => !gitLocation.includes(name)))
