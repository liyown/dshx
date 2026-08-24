-- Development-only catalog fixture. This file is outside migrations and never used remotely.
insert or ignore into publishers(
  id,github_id,login,kind,display_name,avatar_url,profile_url,trust_tier,created_at,updated_at
) values(
  'publisher:dev-fixture','dev-fixture','dshx-dev','organization','DSHX Dev',null,
  'https://github.com/liyown/dshx','official',unixepoch()*1000,unixepoch()*1000
);

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

insert or ignore into plugin_localizations(
  plugin_id,locale,display_name,short_description,overview_markdown,highlights_json,
  install_notes_markdown,seo_title,seo_description,source_locale,source_content_hash,
  translation_status,translator,translated_at,created_at,updated_at
) values
  ('00000000-0000-5000-8000-000000000001','en','DSHX Example Bundle',
   'A development fixture that exercises the complete DSHX Hub marketplace workflow.',
   'This development-only bundle provides realistic catalog data for local UI and API verification.',
   '["Verified installation target","Bilingual catalog content"]',null,
   'DSHX Example Bundle — Development Fixture',
   'Preview the complete DSHX Hub catalog, community, media and approval experience locally.',
   'en','dev-fixture-source-hash-0000000000000000','ready','manual',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000),
  ('00000000-0000-5000-8000-000000000001','zh','DSHX 示例 Bundle',
   '用于验证完整 DSHX Hub 市场流程的本地开发数据。',
   '这条仅用于开发环境的 Bundle 数据可以验证目录、社区、媒体和审批相关界面。',
   '["已验证安装目标","中英文目录内容"]',null,
   'DSHX 示例 Bundle — 本地开发数据',
   '在本地预览完整的 DSHX Hub 目录、社区、媒体与审批体验。',
   'zh','dev-fixture-source-hash-0000000000000000','ready','manual',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000);

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
