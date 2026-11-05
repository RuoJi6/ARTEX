package server

const settingOutputLanguage = "output_language"

// Read on prompt assembly, like the existing prompt overrides, so concurrent
// settings saves cannot leave a process cache out of sync with the database.
func (s *Server) outputLanguage() string {
	if s.m != nil && s.m.pg != nil {
		if value, ok, err := s.m.pg.GetSetting(settingOutputLanguage); err == nil && ok && value == "en" {
			return "en"
		}
	}
	return "zh"
}
