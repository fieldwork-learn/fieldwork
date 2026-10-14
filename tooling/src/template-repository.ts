/** The GitHub org holding the monorepo and every Project's template repository (ADR-0003). */
export const templateOwner = "fieldwork-learn";

/**
 * The template repository a Project is published to, as `<owner>/<repo>`:
 * `<Track's repositoryPrefix>-<Project name>`, so Projects of the same name
 * in different Tracks can't clash (ADR-0003).
 */
export function templateRepository(repositoryPrefix: string, projectName: string): string {
  return `${templateOwner}/${templateRepositoryName(repositoryPrefix, projectName)}`;
}

/** The template repository's name without its owner, e.g. `ts-paginated-api`. */
export function templateRepositoryName(repositoryPrefix: string, projectName: string): string {
  return `${repositoryPrefix}-${projectName}`;
}

/**
 * Publishing tags the monorepo commit it published from as
 * `<template repository name>@<version>`, e.g. `ts-paginated-api@0.1.0`. The
 * Track prefix keeps same-named Projects in different Tracks apart.
 */
export function publishedTag(repositoryPrefix: string, projectName: string, version: string): string {
  return `${templateRepositoryName(repositoryPrefix, projectName)}@${version}`;
}

/** The link that creates a Learner's own repository from a Project's template. */
export function useThisTemplateUrl(repositoryPrefix: string, projectName: string): string {
  return `https://github.com/${templateRepository(repositoryPrefix, projectName)}/generate`;
}
