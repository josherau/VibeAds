-- RLS policies for youtube_channels
CREATE POLICY "Users can view youtube channels for their brands"
  ON youtube_channels FOR SELECT
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert youtube channels for their brands"
  ON youtube_channels FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update youtube channels for their brands"
  ON youtube_channels FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete youtube channels for their brands"
  ON youtube_channels FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- RLS policies for youtube_videos
CREATE POLICY "Users can view youtube videos for their brands"
  ON youtube_videos FOR SELECT
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert youtube videos for their brands"
  ON youtube_videos FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update youtube videos for their brands"
  ON youtube_videos FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete youtube videos for their brands"
  ON youtube_videos FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));
