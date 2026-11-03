  JOIN public.billing_profiles p ON p.ulp_code=t.ulp_code
  WHERE p.user_id=(SELECT auth.uid()) AND p.role='ULP' AND p.is_active
    AND t.id::text=split_part(name,'/',4) AND t.status IN ('OPEN','REJECTED')
));

-- Storage hanya boleh dihapus Admin jika semua target untuk pekerjaan+periode sudah APPROVED.
CREATE POLICY billing_evidence_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='billing-evidence' AND EXISTS (
 SELECT 1 FROM public.billing_evidence_files e
 JOIN public.billing_targets t ON t.id=e.target_id
 JOIN public.billing_profiles p ON p.user_id=(SELECT auth.uid()) AND p.role='ADMIN' AND p.is_active
 WHERE e.path=name AND e.archived_at IS NULL AND t.status='APPROVED'
   AND NOT EXISTS (
     SELECT 1 FROM public.billing_targets other
     WHERE other.job_id=e.job_id AND other.period_year=e.period_year AND other.period_month=e.period_month
       AND other.status<>'APPROVED'
   )
));

CREATE OR REPLACE FUNCTION public.billing_register_evidence(p_target uuid,p_field text,p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.billing_targets%ROWTYPE;
BEGIN
 SELECT * INTO t FROM public.billing_targets WHERE id=p_target FOR UPDATE;
 IF NOT FOUND OR t.status NOT IN ('OPEN','REJECTED') THEN RAISE EXCEPTION 'Target tidak tersedia untuk upload foto'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.billing_profiles WHERE user_id=auth.uid() AND role='ULP' AND is_active AND ulp_code=t.ulp_code)
 THEN RAISE EXCEPTION 'Tidak berhak mengunggah foto target ini'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.billing_jobs j, jsonb_array_elements(j.report_config) f
   WHERE j.id=t.job_id AND f->>'name'=p_field AND f->>'type'='photo')
 THEN RAISE EXCEPTION 'Kolom ini bukan kolom eviden foto'; END IF;
 IF split_part(p_path,'/',1)<>t.ulp_code OR split_part(p_path,'/',2)<>t.job_id::text
   OR split_part(p_path,'/',3)<>(t.period_year::text||'_'||lpad(t.period_month::text,2,'0'))
   OR split_part(p_path,'/',4)<>t.id::text OR right(p_path,4)<>'.jpg'
 THEN RAISE EXCEPTION 'Lokasi file foto tidak valid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='billing-evidence' AND name=p_path)
 THEN RAISE EXCEPTION 'File foto belum ada di Storage'; END IF;
 INSERT INTO public.billing_evidence_files(path,target_id,job_id,period_year,period_month,field_name,archived_at,archived_by)
 VALUES(p_path,t.id,t.job_id,t.period_year,t.period_month,p_field,NULL,NULL)
 ON CONFLICT(target_id,field_name) DO UPDATE SET path=EXCLUDED.path,uploaded_at=now(),archived_at=NULL,archived_by=NULL;
END $$;

CREATE OR REPLACE FUNCTION public.billing_mark_evidence_archived(p_paths text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.billing_profiles WHERE user_id=auth.uid() AND role='ADMIN' AND is_active)
 THEN RAISE EXCEPTION 'Hanya Admin yang boleh mengarsipkan eviden'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.billing_evidence_files e JOIN public.billing_targets t ON t.id=e.target_id
   WHERE e.path=ANY(p_paths) AND (t.status<>'APPROVED' OR EXISTS (
     SELECT 1 FROM public.billing_targets other WHERE other.job_id=e.job_id AND other.period_year=e.period_year
      AND other.period_month=e.period_month AND other.status<>'APPROVED'))
 ) THEN RAISE EXCEPTION 'Semua target pekerjaan dan periode harus disetujui sebelum arsip'; END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='billing-evidence' AND name=ANY(p_paths))
 THEN RAISE EXCEPTION 'Masih ada foto di Storage; status arsip belum boleh ditandai'; END IF;
 UPDATE public.billing_evidence_files SET archived_at=now(),archived_by=auth.uid()
 WHERE path=ANY(p_paths) AND archived_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

-- Perkuat RPC pelaporan: cek kolom wajib, dropdown, dan kepemilikan eviden di server.
CREATE OR REPLACE FUNCTION public.billing_submit(p_target uuid, p_report jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 t public.billing_targets%ROWTYPE;
 f jsonb;
 field_name text;
 field_type text;
 field_val text;
BEGIN
 SELECT * INTO t FROM public.billing_targets WHERE id=p_target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target tidak ditemukan'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.billing_profiles p WHERE p.user_id=auth.uid() AND p.role='ULP' AND p.is_active AND p.ulp_code=t.ulp_code)
 THEN RAISE EXCEPTION 'Akun ini tidak berhak melaporkan target tersebut'; END IF;
 IF t.status NOT IN ('OPEN','REJECTED') THEN RAISE EXCEPTION 'Pekerjaan sudah dikirim atau disetujui'; END IF;
 IF p_report IS NULL OR jsonb_typeof(p_report)<>'object' OR p_report='{}'::jsonb THEN RAISE EXCEPTION 'Isi realisasi terlebih dahulu'; END IF;
 FOR f IN SELECT jsonb_array_elements(j.report_config) FROM public.billing_jobs j WHERE j.id=t.job_id LOOP
   field_name := f->>'name'; field_type := coalesce(f->>'type','text'); field_val := coalesce(p_report->>field_name,'');
   IF coalesce((f->>'required')::boolean,false) AND btrim(field_val)='' THEN
     RAISE EXCEPTION 'Kolom wajib belum diisi: %',field_name;
   END IF;
   IF field_type='select' AND field_val<>'' AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(coalesce(f->'options','[]'::jsonb)) o WHERE o.value=field_val
   ) THEN RAISE EXCEPTION 'Pilihan kategori tidak valid: %',field_name; END IF;
   IF field_type='number' AND field_val<>'' AND field_val !~ '^[-+]?[0-9]+(\.[0-9]+)?$' THEN
     RAISE EXCEPTION 'Nilai angka tidak valid: %',field_name;
   END IF;
   IF field_type='photo' AND field_val<>'' AND NOT EXISTS (
     SELECT 1 FROM public.billing_evidence_files e WHERE e.target_id=t.id AND e.field_name=field_name
       AND e.path=field_val AND e.archived_at IS NULL
   ) THEN RAISE EXCEPTION 'Foto eviden belum terdaftar: %',field_name; END IF;
 END LOOP;
 UPDATE public.billing_targets SET report_data=p_report,status='PENDING',rejection_note=NULL,
   submitted_at=now(),verified_at=NULL,verified_by=NULL,updated_at=now()
 WHERE id=p_target;
END $$;

REVOKE ALL ON FUNCTION public.billing_register_evidence(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.billing_mark_evidence_archived(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.billing_register_evidence(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_mark_evidence_archived(text[]) TO authenticated;
COMMIT;
