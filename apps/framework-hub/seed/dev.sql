-- Development-only catalog fixture. This file is outside migrations and never used remotely.
insert or ignore into publishers(
  id,github_id,login,kind,display_name,avatar_url,profile_url,trust_tier,created_at,updated_at
) values(
  'publisher:dev-fixture','dev-fixture','dshx-dev','organization','DSHX Dev',
  'https://avatars.githubusercontent.com/u/55525531?v=4',
  'https://github.com/liyown/dshx','official',unixepoch()*1000,unixepoch()*1000
);
update publishers set avatar_url='https://avatars.githubusercontent.com/u/55525531?v=4'
where id='publisher:dev-fixture';

insert or ignore into publisher_localizations(
  publisher_id,locale,display_name,bio,seo_title,seo_description,source_content_hash,status,updated_at
) values
  ('publisher:dev-fixture','en','DSHX Dev',
   'Maintainers of the DSHX development fixture and reference integration.',
   'DSHX Dev — DSHX plugin publisher',
   'Explore verified DSH plugins and reference integrations maintained by the DSHX development team.',
   'dev-fixture-publisher-hash-0000000000000000','ready',unixepoch()*1000),
  ('publisher:dev-fixture','zh','DSHX 开发团队',
   'DSHX 本地开发数据与参考集成的维护团队。',
   'DSHX 开发团队 — DSHX 插件发布者',
   '浏览由 DSHX 开发团队维护的已验证 DSH 插件与参考集成。',
   'dev-fixture-publisher-hash-0000000000000000','ready',unixepoch()*1000);

insert or ignore into repositories(
  id,github_id,publisher_id,owner_login,name,full_name,canonical_url,default_branch,
  topics_json,is_fork,is_archived,is_disabled,candidate_status,content_hash,
  first_seen_at,last_seen_at,created_at,updated_at
) values(
  'repository:dev-fixture','dev-fixture','publisher:dev-fixture','dshx-dev','example-bundle',
  'dshx-dev/example-bundle','https://github.com/liyown/dshx','main','["dsh-plugin"]',
  0,0,0,'qualified','dev-fixture-source-hash-0000000000000000',
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or ignore into repository_packages(
  id,repository_id,subdirectory,package_name,package_version,package_json_sha,patch_path,
  install_kind,install_spec,dsh_bundle,dshx_detected,qualification_status,
  consecutive_failures,validation_summary_json,verified_at,created_at,updated_at
) values(
  'package:dev-fixture:','repository:dev-fixture','','@dshx-dev/example-bundle','1.2.0',
  'dev-fixture-package-sha','dist/plugin.patch.json','npm','@dshx-dev/example-bundle',1,1,
  'verified',0,'[{"code":"dev.fixture","status":"pass"}]',
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or ignore into plugins(
  id,slug,identity_key,package_name,name,description,author_handle,category,badge,
  latest_version,compatibility_range,publisher_id,primary_repository_id,
  primary_repository_package_id,verification_status,trust_tier,lifecycle_status,status,
  license_spdx,repository_url,dshx_detected,featured,first_published_at,last_synced_at,
  published_at,created_at,updated_at
) values(
  '00000000-0000-5000-8000-000000000001','dshx-example-bundle',
  'npm:@dshx-dev/example-bundle','@dshx-dev/example-bundle','DSHX Example Bundle',
  'Development-only fixture for exercising the real catalog, community and approval surfaces.',
  'dshx-dev','developer-tools','official','1.2.0','>=0.1.0',
  'publisher:dev-fixture','repository:dev-fixture','package:dev-fixture:','verified','official',
  'active','published','MIT','https://github.com/liyown/dshx',1,1,
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or replace into plugin_localizations(
  plugin_id,locale,display_name,short_description,overview_markdown,highlights_json,
  install_notes_markdown,seo_title,seo_description,source_locale,source_content_hash,
  translation_status,translator,translated_at,created_at,updated_at
) values
  ('00000000-0000-5000-8000-000000000001','en','DSHX Example Bundle',
   'A development fixture that exercises the complete DSHX Hub marketplace workflow.',
   'DSHX Example Bundle is a development-only fixture for exercising the complete Hub ingestion and marketplace path without depending on third-party plugin code.

It supplies a bilingual catalog profile, publisher identity, exact npm installation target, release metadata, category assignment, metrics, community surfaces, and a preserved source README. Maintainers can use it to verify that source evidence and Agent-authored curation remain separate while still appearing together on the plugin detail page.

Use it only in the local preview environment with the displayed @dshx-dev/example-bundle target. It is sample data rather than a production plugin, so its compatibility, downloads, stars, and release history must not be treated as real package claims.',
   '["Verified installation target","Bilingual catalog content"]',null,
   'DSHX Example Bundle — Development Fixture',
   'Preview the complete DSHX Hub catalog, community, media and approval experience locally.',
   'en','dev-fixture-source-hash-0000000000000000','ready','manual',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000),
  ('00000000-0000-5000-8000-000000000001','zh','DSHX 示例 Bundle',
   '用于验证完整 DSHX Hub 市场流程的本地开发数据。',
   'DSHX 示例 Bundle 是一条仅用于开发环境的完整市场流程样本，帮助维护者在不执行第三方插件代码的前提下验证 Hub 从采集、整理到展示的链路。

它覆盖中英文插件资料、作者身份与头像、精确 npm 安装目标、版本与分类、指标、社区功能，以及独立保存的原始 README。维护者可以据此检查来源证据和运营 Agent 编写的概述是否保持分离，同时在插件详情页正确关联。

本地预览时可以使用页面展示的 @dshx-dev/example-bundle 安装目标进行界面验证。它不是线上真实插件，因此兼容性、下载量、Stars 和版本历史都不能作为实际包信息使用。',
   '["已验证安装目标","中英文目录内容"]',null,
   'DSHX 示例 Bundle — 本地开发数据',
   '在本地预览完整的 DSHX Hub 目录、社区、媒体与审批体验。',
   'zh','dev-fixture-source-hash-0000000000000000','ready','manual',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000);

insert or replace into plugin_source_documents(
  id,plugin_id,kind,availability,format,source_url,source_ref,source_path,
  content,content_hash,observed_at,created_at,updated_at
) values(
  '00000000-0000-5000-8000-000000000001:readme',
  '00000000-0000-5000-8000-000000000001','readme','available','markdown',
  'https://github.com/liyown/dshx/blob/main/README.md','main','README.md',
  '# DSHX Example Bundle

This development-only README verifies preservation of original source documents.

## Capabilities

- Exercises bilingual catalog overviews.
- Demonstrates an exact npm installation target.
- Keeps source evidence separate from Agent-maintained curation.

## Install

Use the exact version shown by the local fixture. Never treat this development record as production plugin data.',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or ignore into plugin_install_targets(
  id,plugin_id,repository_package_id,kind,spec,package_name,version,integrity,is_primary,
  status,verified_at,created_at,updated_at
) values(
  '00000000-0000-5000-8000-000000000001:target:npm',
  '00000000-0000-5000-8000-000000000001','package:dev-fixture:','npm',
  '@dshx-dev/example-bundle','@dshx-dev/example-bundle','1.2.0',null,1,'active',
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or ignore into plugin_releases(
  id,plugin_id,version,channel,compatibility_range,compatibility_source,deprecated,
  published_at,created_at,updated_at
) values(
  '00000000-0000-5000-8000-000000000001:release:1.2.0',
  '00000000-0000-5000-8000-000000000001','1.2.0','stable','>=0.1.0','manifest',0,
  unixepoch()*1000,unixepoch()*1000,unixepoch()*1000
);

insert or ignore into plugin_categories(plugin_id,category_id,is_primary,sort_order)
values('00000000-0000-5000-8000-000000000001','category-developer-tools',1,0);

insert or ignore into plugin_metrics_current(
  plugin_id,github_stars,github_forks,github_open_issues,npm_downloads_day,npm_downloads_week,
  trend_score_7d,trend_score_30d,review_count,rating_sum,updated_at
) values(
  '00000000-0000-5000-8000-000000000001',128,12,3,24,172,93,211,0,0,unixepoch()*1000
);

delete from plugin_search where plugin_id='00000000-0000-5000-8000-000000000001';
insert into plugin_search(
  plugin_id,locale,display_name,short_description,package_name,publisher_login,category_names
) values
  ('00000000-0000-5000-8000-000000000001','en','DSHX Example Bundle',
   'A development fixture that exercises the complete DSHX Hub marketplace workflow.',
   '@dshx-dev/example-bundle','dshx-dev','Developer Tools'),
  ('00000000-0000-5000-8000-000000000001','zh','DSHX 示例 Bundle',
   '用于验证完整 DSHX Hub 市场流程的本地开发数据。',
   '@dshx-dev/example-bundle','dshx-dev','开发工具');
